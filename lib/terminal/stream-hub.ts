/** Where a session's output goes. `done` is called once the text has been
 *  parsed (xterm's write callback); that is what the hub acknowledges. */
export type StreamTarget = { write(data: string, done?: () => void): void }
export type StreamSource = {
  onmessage: ((event: { data: string }) => void) | null
  onopen: (() => void) | null
  close(): void
}
export type AckItem = { session: string; n: number }
/** Resolves `false` (or rejects) when the server did not take the ack. */
export type SendAck = (stream: string, items: AckItem[]) => Promise<boolean | void>

/** How long acks gather before they are sent. They only need to arrive well
 *  before the server's 100k-character pause point, not per chunk. */
const ACK_EVERY_MS = 16
/** After an ack the server refused. Long enough not to hammer a restarting
 *  server; a reconnect's new stream id stops the retries anyway. */
const ACK_RETRY_MS = 50

/** A full terminal reset (RIS), written IN-BAND so it lands after anything
 *  still queued in xterm's write buffer — `term.reset()` does not clear that
 *  buffer, so old data would draw after the reset and before the replay. */
const RESET = "\x1bc"

/**
 * The page's one connection to all of a company's terminals (company-stream.ts
 * on the server), fanned out to the xterm each frame belongs to.
 *
 * What a per-tab EventSource never had to think about:
 *
 * - **Output before its pane exists.** An assistant starts talking while the
 *   open request is still returning; those frames are held (capped) and handed
 *   over when the pane attaches, rather than dropped.
 * - **Reconnects.** EventSource reconnects by itself after a server restart,
 *   and the server replays the backlog of every session still alive. A pane is
 *   reset on its FIRST frame after the reconnect, so a replay is not drawn on
 *   top of what was already there — and a pane whose session did not survive
 *   gets no frame, so it keeps its last screen instead of going blank.
 * - **Flow control.** Characters are acknowledged once a pane has DRAWN them,
 *   and the server pauses a session this page has fallen 100k characters behind
 *   on. Every path where nothing would ever draw is acknowledged on receipt
 *   instead, because an unacknowledged character pauses a real process:
 *   output for a session with no pane here (another window's tab, a tab whose
 *   close failed), and all output while the page is hidden (a background
 *   window's timers are throttled to once a second or slower, which would stall
 *   an agent the user walked away from). A refused ack is re-sent.
 */
export function createStreamHub(
  open: () => StreamSource,
  sendAck?: SendAck,
  maxUnclaimed = 200_000,
  isHidden: () => boolean = () => false
) {
  const targets = new Map<string, StreamTarget>()
  const unclaimed = new Map<string, string>()
  const needsReset = new Set<string>()
  let opens = 0

  // Acks for the CURRENT stream only: a reconnect is a new stream with its own
  // count, and crediting it with the old one's characters would under-pause it.
  let streamId: string | null = null
  const pendingAcks = new Map<string, number>()
  let ackTimer: ReturnType<typeof setTimeout> | null = null
  let ackInFlight = false
  let closed = false

  const scheduleAcks = (delay = ACK_EVERY_MS) => {
    if (!ackTimer && !closed) ackTimer = setTimeout(() => void flushAcks(), delay)
  }
  const flushAcks = async () => {
    if (ackTimer) clearTimeout(ackTimer)
    ackTimer = null
    if (ackInFlight || closed || !sendAck || !streamId || pendingAcks.size === 0) return
    ackInFlight = true
    const stream = streamId
    const items = [...pendingAcks].map(([session, n]) => ({ session, n }))
    pendingAcks.clear()
    let accepted = false
    try {
      accepted = (await sendAck(stream, items)) !== false
    } catch {
      accepted = false
    }
    ackInFlight = false
    // A lost ack is permanent otherwise: a held session sends nothing more, so
    // there would be nothing new to acknowledge. Put it back for the same
    // stream; a new stream (reconnect) starts from zero and drops it.
    if (!accepted && streamId === stream) {
      for (const { session, n } of items) pendingAcks.set(session, (pendingAcks.get(session) ?? 0) + n)
      scheduleAcks(ACK_RETRY_MS)
    } else if (pendingAcks.size > 0) {
      scheduleAcks()
    }
  }
  const ack = (session: string, n: number) => {
    if (n <= 0 || !streamId || closed) return
    pendingAcks.set(session, (pendingAcks.get(session) ?? 0) + n)
    // Hidden: timers are throttled, so send from here (a network event, which
    // is not) rather than waiting on one.
    if (isHidden()) void flushAcks()
    else scheduleAcks()
  }
  /** `chars` is what the server counted: the frame, without any reset prefix. */
  const deliver = (target: StreamTarget, session: string, data: string, chars: number) => {
    if (isHidden() || chars === 0) {
      target.write(data)
      ack(session, chars)
      return
    }
    const id = streamId
    // Only credit the stream that sent it: a write parsed after a reconnect
    // belongs to a stream the server has already forgotten.
    target.write(data, () => {
      if (streamId === id) ack(session, chars)
    })
  }

  const source = open()
  source.onopen = () => {
    if (opens++ === 0) return
    unclaimed.clear()
    for (const session of targets.keys()) needsReset.add(session)
  }
  source.onmessage = (event) => {
    let frame: { s?: unknown; d?: unknown; hello?: unknown }
    try {
      frame = JSON.parse(event.data)
    } catch {
      return
    }
    if (typeof frame.hello === "string") {
      streamId = frame.hello
      pendingAcks.clear()
      return
    }
    if (typeof frame.s !== "string" || typeof frame.d !== "string") return
    const target = targets.get(frame.s)
    if (target) {
      const prefix = needsReset.delete(frame.s) ? RESET : ""
      return deliver(target, frame.s, prefix + frame.d, frame.d.length)
    }
    // No pane for it on this page: acknowledge now, keep a capped copy in case
    // one attaches. Waiting for a pane that may never exist would pause it.
    unclaimed.set(frame.s, ((unclaimed.get(frame.s) ?? "") + frame.d).slice(-maxUnclaimed))
    ack(frame.s, frame.d.length)
  }

  return {
    attach(session: string, target: StreamTarget) {
      targets.set(session, target)
      const held = unclaimed.get(session)
      if (held) {
        unclaimed.delete(session)
        deliver(target, session, held, 0) // already acknowledged on receipt
      }
      return () => {
        if (targets.get(session) === target) targets.delete(session)
        needsReset.delete(session)
      }
    },
    close() {
      closed = true
      if (ackTimer) clearTimeout(ackTimer)
      source.close()
      targets.clear()
      unclaimed.clear()
      pendingAcks.clear()
      needsReset.clear()
    },
  }
}

/** A browser EventSource as a StreamSource. Its own handlers are typed with
 *  `this: EventSource`, so it can't stand in for the plain shape the hub (and
 *  its tests) use; this forwards instead. Browser-only when called. */
export function openEventSource(url: string): StreamSource {
  const es = new EventSource(url)
  const source: StreamSource = { onmessage: null, onopen: null, close: () => es.close() }
  es.onmessage = (event) => source.onmessage?.(event)
  es.onopen = () => source.onopen?.()
  return source
}
