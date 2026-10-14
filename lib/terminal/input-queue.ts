export type InputItem = { session: string; data: string }

/**
 * Keystrokes to the server, in order, over one request at a time.
 *
 * It was a fetch per keystroke. Concurrent fetches can land out of order —
 * which a shell shows as a garbled command — and each one is a request fighting
 * the SSE stream for the browser's six connections. Here at most one POST is in
 * flight; anything typed meanwhile piles up per session and goes in the next
 * one. On localhost a round trip is ~1ms, so batching costs no perceptible
 * latency and makes a 10KB paste one request instead of thousands.
 *
 * No sequence numbers: with one request in flight and no retries, order is
 * already guaranteed. A failed batch is dropped — the only way a batch fails is
 * the server or the pty being gone.
 */
export function createInputQueue(send: (items: InputItem[]) => Promise<unknown>) {
  const pending = new Map<string, string>()
  let inFlight = false

  async function pump() {
    if (inFlight || pending.size === 0) return
    inFlight = true
    const items = [...pending].map(([session, data]) => ({ session, data }))
    pending.clear()
    try {
      await send(items)
    } catch {
      /* the server or the pty is gone; nothing to deliver to */
    } finally {
      inFlight = false
      void pump()
    }
  }

  return {
    enqueue(session: string, data: string) {
      pending.set(session, (pending.get(session) ?? "") + data)
      queueMicrotask(() => void pump())
    },
  }
}
