import type { HeldAction } from "./store"

/** Pure wording and rules for held steps, safe in client components (no Node imports). */

/** How long one Outlook send may take before it is stopped. A `sending` item older than this is stuck. */
export const SEND_TIMEOUT_MS = 60_000

export const isStuckSending = (h: Pick<HeldAction, "status" | "decidedAt" | "clearedAt">, nowMs: number) =>
  h.status === "sending" && !h.clearedAt && !!h.decidedAt && nowMs - Date.parse(h.decidedAt) > SEND_TIMEOUT_MS

/**
 * What Approvals lists (and the badge counts): waiting, mid-send, failed sends, and approved steps
 * the owner still has to do themselves. Clearing one (`clearedAt`) takes it off; history keeps it.
 */
export const isOpenHeld = (h: Pick<HeldAction, "status" | "clearedAt">) =>
  h.status === "pending" || ((h.status === "sending" || h.status === "failed" || h.status === "approved") && !h.clearedAt)

/** "26 Oct", in the owner's own time zone. */
export const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "")

export function rowWords(held: Pick<HeldAction, "row" | "mail">): string {
  if (held.row === "money") return "Spends money"
  if (held.row === "credentials") return "Changes access"
  return held.mail ? "Sends a message" : "Makes something public"
}

/** What "Approve all" will do, said before anything is sent. */
export function bulkSummary(items: Pick<HeldAction, "row" | "mail">[]): string {
  const mails = items.filter((i) => i.mail)
  const people = new Set(mails.map((m) => m.mail!.to)).size
  const others = items.length - mails.length
  const parts: string[] = []
  if (mails.length) parts.push(`sends ${mails.length} message${mails.length === 1 ? "" : "s"} to ${people} ${people === 1 ? "person" : "people"}`)
  if (others) parts.push(`records ${others} decision${others === 1 ? "" : "s"} for you to carry out yourself`)
  return `This ${parts.join(" and ")}. Nothing is sent until you confirm.`
}

/** One line per held step, for the job's history on the Jobs page. Never claims a step Alacrán can't do was done. */
export function heldStatusWords(item: HeldAction, nowMs: number): string {
  switch (item.status) {
    case "pending":
      return "Waiting in Approvals"
    case "sending":
      if (item.clearedAt) return "Cleared while sending: check Outlook's Sent folder to see if it went"
      return isStuckSending(item, nowMs) ? "Stuck while sending: check Outlook's Sent folder" : "Sending…"
    case "sent":
      return `Sent ${shortDate(item.sentAt)}`
    case "failed":
      return `Didn't send: ${item.reason ?? "unknown reason"}`
    case "approved":
      return `Approved ${shortDate(item.decidedAt)}, you do this step yourself${item.clearedAt ? `; you marked it done ${shortDate(item.clearedAt)}` : ""}`
    case "rejected":
      return `Rejected ${shortDate(item.decidedAt)}`
  }
}
