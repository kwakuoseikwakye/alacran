import { isValidSessionId } from "./sessions"
import type { InputItem } from "./input-queue"

/** A page has at most 8 sessions; 64 is slack, not a real batch size, and
 *  bounds what one request can make the server loop over. */
export const MAX_BATCH_ITEMS = 64

/** The body of an `input-batch` POST, checked item by item — every session id
 *  names a real process, so none is trusted as sent. */
export function parseInputBatch(body: unknown): InputItem[] | null {
  const items = (body as { items?: unknown })?.items
  if (!Array.isArray(items) || items.length > MAX_BATCH_ITEMS) return null
  const parsed: InputItem[] = []
  for (const item of items) {
    const { session, data } = (item ?? {}) as { session?: unknown; data?: unknown }
    if (typeof session !== "string" || !isValidSessionId(session) || typeof data !== "string") return null
    parsed.push({ session, data })
  }
  return parsed
}

/** The body of an `ack` POST (company-stream.ts flow control). The stream id is
 *  a UUID the server minted; anything else is refused before it is looked up. */
export function parseAckBatch(body: unknown): { stream: string; items: { session: string; n: number }[] } | null {
  const { stream, items } = (body ?? {}) as { stream?: unknown; items?: unknown }
  if (typeof stream !== "string" || !/^[0-9a-f-]{36}$/.test(stream)) return null
  if (!Array.isArray(items) || items.length > MAX_BATCH_ITEMS) return null
  const parsed: { session: string; n: number }[] = []
  for (const item of items) {
    const { session, n } = (item ?? {}) as { session?: unknown; n?: unknown }
    if (typeof session !== "string" || !isValidSessionId(session)) return null
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) return null
    parsed.push({ session, n })
  }
  return { stream, items: parsed }
}
