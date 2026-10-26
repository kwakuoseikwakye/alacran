import type { HeldAction } from "./store"

/** Pure wording for held steps, safe in client components (no Node imports). */
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
