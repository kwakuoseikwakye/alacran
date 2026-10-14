import { closeSync, openSync, readSync } from "node:fs"

/**
 * Reads an agent run's log as it grows, one complete line at a time.
 *
 * A pull, not a watcher: the run engine asks on its own tick, which is also how
 * flow control works for a run — a paused run is simply not read for a while,
 * and the log waits on disk. Bytes are decoded in stream mode so a character
 * split across two reads is not garbled, and a trailing partial line is held
 * until its newline arrives (a stream-json event is only parseable whole).
 */
export function createLogTail(file: string, chunkBytes = 256 * 1024, startOffset = 0) {
  let fd: number | null = null
  let offset = startOffset
  let partial = ""
  const decoder = new TextDecoder()

  const chunk = (): string[] | null => {
    if (fd === null) {
      try {
        fd = openSync(file, "r")
      } catch {
        return null // not written yet
      }
    }
    const buffer = Buffer.alloc(chunkBytes)
    const n = readSync(fd, buffer, 0, chunkBytes, offset)
    if (n === 0) return null
    offset += n
    const lines = (partial + decoder.decode(buffer.subarray(0, n), { stream: true })).split("\n")
    partial = lines.pop() ?? ""
    return lines
  }

  return {
    read: (): string[] => chunk() ?? [],
    /** Everything left, including a last line with no newline — for once the writer has exited. */
    readRest(): string[] {
      const out: string[] = []
      for (let lines = chunk(); lines; lines = chunk()) out.push(...lines)
      const last = partial + decoder.decode()
      partial = ""
      if (last) out.push(last)
      return out
    },
    close() {
      if (fd === null) return
      try {
        closeSync(fd)
      } catch {
        /* already closed */
      }
      fd = null
    },
  }
}
