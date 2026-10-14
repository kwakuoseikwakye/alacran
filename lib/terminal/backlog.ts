/**
 * What a session has printed, capped at `max` characters.
 *
 * It used to be `(backlog + chunk).slice(-MAX_BACKLOG)` on every chunk — a
 * 200KB copy per chunk, per session, which is most of the server's CPU once
 * eight sessions are chatty at once. Chunks are kept as they arrive instead and
 * only joined when a client attaches, which is rare.
 */
export type Backlog = { push(chunk: string): void; text(): string }

/** Past this many chunks they are joined into one, so a flood of keystroke
 *  echoes can't grow the array (and the cost of trimming its front) unbounded. */
const COMPACT_AT = 1024

export function createBacklog(max: number): Backlog {
  const chunks: string[] = []
  let length = 0
  return {
    push(chunk) {
      if (!chunk) return
      chunks.push(chunk)
      length += chunk.length
      // Drop whole chunks from the front while what remains still covers `max`.
      while (chunks.length > 1 && length - chunks[0].length >= max) length -= chunks.shift()!.length
      if (chunks.length > COMPACT_AT) {
        const joined = chunks.join("").slice(-max)
        chunks.length = 0
        chunks.push(joined)
        length = joined.length
      }
    },
    text() {
      const all = chunks.join("")
      return all.length > max ? all.slice(-max) : all
    },
  }
}
