/**
 * Turns a pty's stream of small chunks into few SSE frames.
 *
 * Leading edge, then at most one flush per `intervalMs`: a keystroke echo after
 * a quiet moment goes out at once (typing must feel instant), while a build
 * printing thousands of lines a second becomes ~60 frames a second instead of
 * thousands — which is what keeps eight busy panes from drowning the browser's
 * main thread in `message` events.
 */
export function createCoalescer(flush: (data: string) => void, intervalMs = 16, maxChars = 32_768) {
  let pending = ""
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastFlush = -Infinity

  const drain = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!pending) return
    const out = pending
    pending = ""
    lastFlush = Date.now()
    flush(out)
  }

  return {
    push(chunk: string) {
      pending += chunk
      if (pending.length >= maxChars) return drain()
      if (timer) return
      const since = Date.now() - lastFlush
      if (since >= intervalMs) return drain()
      timer = setTimeout(drain, intervalMs - since)
    },
    close: drain,
  }
}
