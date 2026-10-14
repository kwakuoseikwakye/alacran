/**
 * Contact layer for the funnel — ties a lead to the last message exchanged
 * with them across the OS comms feed. Pure matching; the page feeds it
 * comms feed items and renders honestly when nothing matches.
 */

export type FunnelCommsItem = {
  source: string
  title: string
  preview: string
  ts: string // ISO timestamp or date
  sender?: string
  replyTo?: string
}

const MIN_NAME_MATCH = 5 // "Sam" must never hijack "Samantha Corp Billing"

export const agoDays = (ts: string, now: Date): string => {
  const parsed = Date.parse(ts)
  if (Number.isNaN(parsed)) return ts
  const d = Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000))
  return d === 0 ? "today" : `${d}d ago`
}

/**
 * Newest comms item that plausibly belongs to this lead: exact email match on
 * replyTo/sender first-class, else the lead's full name appearing in the
 * sender or title. Null when nothing matches — no guessing.
 */
export function lastMessageFor(
  lead: { name: string; email?: string | null; person?: string | null },
  items: FunnelCommsItem[]
): FunnelCommsItem | null {
  const email = lead.email?.trim().toLowerCase() ?? null
  const name = (lead.person ?? lead.name).trim().toLowerCase()
  const nameUsable = name.length >= MIN_NAME_MATCH

  const matches = items.filter((i) => {
    const replyTo = i.replyTo?.trim().toLowerCase()
    const sender = i.sender?.trim().toLowerCase() ?? ""
    const title = i.title?.trim().toLowerCase() ?? ""
    if (email && (replyTo === email || sender === email)) return true
    if (nameUsable && (sender.includes(name) || title.includes(name))) return true
    return false
  })

  if (matches.length === 0) return null
  return matches.reduce((newest, i) => {
    const tCurrent = Date.parse(i.ts)
    const tNewest = Date.parse(newest.ts)
    if (Number.isNaN(tCurrent)) return newest
    if (Number.isNaN(tNewest)) return i
    return tCurrent > tNewest ? i : newest
  })
}
