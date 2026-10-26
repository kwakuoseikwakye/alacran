import { randomUUID } from "node:crypto"
import type { HoldRequest } from "./runner"
import { outlookSend, sha256, type SendFn } from "./send-lane"
import type { HeldAction, HoldOutcome, JobStore } from "./store"

export { bulkSummary, rowWords } from "./held-words"

/**
 * The held-action queue (v248): AGENTS.md §6 turned into a stop the app enforces for unattended
 * jobs. A job asks in its report; the step waits here until the owner decides in Approvals. A held
 * mail is sent only by `decideHeld`, which only a server action calls, with the snapshot stored at
 * hold time, so what goes out is exactly what the owner read.
 */
/** Same job, row and content is the same step, however many days the job asks for it again. */
export function holdKey(jobId: string, hold: HoldRequest): string {
  return sha256(JSON.stringify([jobId, hold.row, hold.title, hold.detail, hold.mail ?? null]))
}

const KEEP_DECIDED = 500
// ponytail: keeps the newest 500 decided items and drops older ones; archive them if long history matters.
function prune(held: HeldAction[]): HeldAction[] {
  const decided = held.filter((h) => h.status !== "pending" && h.status !== "sending")
  if (decided.length <= KEEP_DECIDED) return held
  const drop = new Set(decided.slice(0, decided.length - KEEP_DECIDED))
  return held.filter((h) => !drop.has(h))
}

const waiting = (h: HeldAction) => h.status === "pending" || h.status === "sending"

export async function recordHolds(
  store: JobStore,
  input: { jobId: string; runId: string; entries: HoldRequest[]; now: Date }
): Promise<HoldOutcome[]> {
  return store.updateHeld((held) => {
    const open = new Set(held.filter(waiting).map((h) => h.key))
    const outcomes: HoldOutcome[] = []
    const added: HeldAction[] = []
    for (const entry of input.entries) {
      const key = holdKey(input.jobId, entry)
      if (open.has(key)) {
        outcomes.push({ row: entry.row, title: entry.title, result: "already-waiting" })
        continue
      }
      open.add(key)
      added.push({
        id: randomUUID(),
        key,
        jobId: input.jobId,
        runId: input.runId,
        row: entry.row,
        title: entry.title,
        detail: entry.detail,
        ...(entry.mail ? { mail: { ...entry.mail } } : {}),
        createdAt: input.now.toISOString(),
        status: "pending",
      })
      outcomes.push({ row: entry.row, title: entry.title, result: "held" })
    }
    return { held: prune([...held, ...added]), result: outcomes }
  })
}

export type DecideResult = { sent: number; failed: number; recorded: number; rejected: number; cleared: number; skipped: number }

/**
 * The owner's yes or no to the ids they were shown. Phase 1 claims under the lock (only one caller
 * can see an item `pending`), phase 2 sends outside it so a slow Outlook never blocks the tick, and
 * phase 3 records the result. A failed send is never retried; rejecting it clears it from Approvals.
 */
export async function decideHeld(
  store: JobStore,
  ids: string[],
  decision: "approve" | "reject",
  send: SendFn = outlookSend,
  now: () => Date = () => new Date()
): Promise<DecideResult> {
  const result: DecideResult = { sent: 0, failed: 0, recorded: 0, rejected: 0, cleared: 0, skipped: 0 }
  const wanted = new Set(ids)
  const claimed = await store.updateHeld((held) => {
    const at = now().toISOString()
    const mine: HeldAction[] = []
    const seen = new Set<string>()
    const next = held.map((h) => {
      if (!wanted.has(h.id) || seen.has(h.id)) return h
      seen.add(h.id)
      if (decision === "reject" && h.status === "failed" && !h.clearedAt) {
        result.cleared++
        return { ...h, clearedAt: at }
      }
      if (h.status !== "pending") {
        result.skipped++
        return h
      }
      if (decision === "reject") {
        result.rejected++
        return { ...h, status: "rejected" as const, decidedAt: at }
      }
      if (!h.mail) {
        // Nothing Alacrán can carry out: the decision is recorded and the owner does the step.
        result.recorded++
        return { ...h, status: "approved" as const, decidedAt: at }
      }
      const claim = { ...h, status: "sending" as const, decidedAt: at }
      mine.push(claim)
      return claim
    })
    result.skipped += [...wanted].filter((id) => !seen.has(id)).length
    return { held: next, result: mine }
  })

  for (const item of claimed) {
    let outcome: Partial<HeldAction>
    try {
      await send(item.mail!)
      result.sent++
      outcome = { status: "sent", sentAt: now().toISOString() }
    } catch (error) {
      result.failed++
      outcome = { status: "failed", reason: `Sending failed: ${(error as Error).message}` }
    }
    await store.updateHeld((held) => ({ held: prune(held.map((h) => (h.id === item.id ? { ...h, ...outcome } : h))), result: null }))
  }
  return result
}

export function decideMessage(r: DecideResult): string {
  const parts = [
    r.sent ? `Sent ${r.sent}` : "",
    r.failed ? `${r.failed} failed to send` : "",
    r.recorded ? `${r.recorded} approved for you to do yourself` : "",
    r.rejected ? `Rejected ${r.rejected}` : "",
    r.cleared ? `Cleared ${r.cleared}` : "",
    r.skipped ? `${r.skipped} already decided` : "",
  ].filter(Boolean)
  return parts.length ? `${parts.join(", ")}.` : "Nothing changed."
}
