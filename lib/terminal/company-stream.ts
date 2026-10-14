import { randomUUID } from "node:crypto"
import { createCoalescer } from "./coalesce"
import { getSession, holdOutput, listSessions, releaseOutput, subscribeCompany, type TerminalSession } from "./sessions"

/**
 * Flow control, the scheme VS Code's terminal uses: the client acknowledges
 * characters once xterm has actually PARSED them, and a session with more than
 * HIGH unacknowledged is paused until the client is back under LOW.
 *
 * Why acks rather than the stream's own backpressure: measured with seven
 * panes running `yes`, the server and the socket kept up fine — the queue that
 * grew was inside the browser, in seven xterm write buffers parsing on the one
 * main thread, and a keystroke's reply waited behind them (p95 ~90ms). Only
 * the client knows how far behind it is, so only an ack can bound that.
 */
const ACK_HIGH_CHARS = 100_000
const ACK_LOW_CHARS = 5_000

/** Open streams by id, so an ack arriving on a POST can find its stream. Module
 *  state, like `sessions` — it lives in the same route bundle for the same reason. */
const streams = new Map<string, (session: string, chars: number) => void>()

/** Credit a stream with what its client has drawn. An ack for a stream that has
 *  already closed (a reload racing its last ack) is nothing to act on. */
export function ackStream(streamId: string, items: { session: string; n: number }[]): void {
  const ack = streams.get(streamId)
  if (!ack) return
  for (const { session, n } of items) ack(session, n)
}

/**
 * Every terminal of one company over ONE SSE response.
 *
 * It was one EventSource per tab. The app is served by Next's standalone
 * server over HTTP/1.1, where Chromium allows six connections per host — so a
 * sixth pane (plus the terminal-status stream) stalled, and every keystroke
 * POST queued behind it. One stream, tagged per session, keeps a page at a
 * single long-lived connection however many panes it shows.
 *
 * Attach only, like the per-session GET it replaces: starting a process stays a
 * POST, because a GET is reachable cross-origin without a preflight.
 */
export function companyStreamResponse(request: Request, agentId: string): Response {
  const encoder = new TextEncoder()
  const streamId = randomUUID()
  /** Characters sent per session that the client hasn't acknowledged yet. */
  const unacked = new Map<string, number>()
  /** Sessions this stream has paused. Released on ack, detach, and abort. */
  const held = new Map<string, TerminalSession>()
  const attachedSessions = new Map<string, TerminalSession>()

  const release = (id: string) => {
    const session = held.get(id)
    if (!session) return
    held.delete(id)
    releaseOutput(session)
  }

  // Set in start(); run on abort, on cancel, or at once if the client had
  // already gone. Idempotent, because more than one of those can happen.
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: object) => {
        try {
          // JSON so a newline in terminal output can never read as a frame boundary.
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
          return true
        } catch {
          // Client vanished mid-write; the abort handler cleans up.
          return false
        }
      }
      const frame = (s: string, d: string) => {
        if (!send({ s, d })) return
        const outstanding = (unacked.get(s) ?? 0) + d.length
        unacked.set(s, outstanding)
        const session = attachedSessions.get(s)
        if (outstanding > ACK_HIGH_CHARS && session && !held.has(s)) {
          held.set(s, session)
          holdOutput(session)
        }
      }

      // First frame: the id the client quotes in its acks.
      send({ hello: streamId })
      streams.set(streamId, (s, chars) => {
        const outstanding = Math.max(0, (unacked.get(s) ?? 0) - chars)
        unacked.set(s, outstanding)
        if (outstanding < ACK_LOW_CHARS) release(s)
      })

      const attached = new Map<string, () => void>()
      const attach = (session: TerminalSession) => {
        if (attached.has(session.id)) return
        attachedSessions.set(session.id, session)
        // Replay first, so a reload redraws a live session instead of a blank screen.
        const text = session.backlog.text()
        if (text) frame(session.id, text)
        const out = createCoalescer((d) => frame(session.id, d))
        const listener = (chunk: string) => out.push(chunk)
        session.listeners.add(listener)
        attached.set(session.id, () => {
          session.listeners.delete(listener)
          // close() flushes: the last thing a session says ("[session ended]") is
          // pushed moments before it is removed, and must not be dropped.
          out.close()
          release(session.id)
          attachedSessions.delete(session.id)
          unacked.delete(session.id)
        })
      }
      const detach = (id: string) => {
        attached.get(id)?.()
        attached.delete(id)
      }

      for (const { id } of listSessions(agentId)) {
        const session = getSession(agentId, id)
        if (session) attach(session)
      }
      const unsubscribe = subscribeCompany(agentId, (event) =>
        event.type === "added" ? attach(event.session) : detach(event.id)
      )

      let cleaned = false
      cleanup = () => {
        if (cleaned) return
        cleaned = true
        unsubscribe()
        streams.delete(streamId)
        for (const id of [...attached.keys()]) detach(id)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
      // The route awaits the company registry before this runs, and a client
      // that disconnected during that await has ALREADY aborted — a listener
      // added now never fires, and Next then drops the body unread. Without
      // this check that stream would stay subscribed forever, and its unacked
      // count would pause every session it saw for good.
      if (request.signal.aborted) cleanup()
      else request.signal.addEventListener("abort", cleanup)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // no-transform: a buffering proxy turns a terminal into a page that updates once, at the end.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
