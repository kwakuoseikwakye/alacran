import { randomUUID } from "node:crypto"
import type { HoldRequest } from "./runner"
import { outlookSend, sha256, type SendFn } from "./send-lane"
import type { HeldAction, HoldOutcome, JobStore } from "./store"

import { isOpenHeld, isStuckSending } from "./held-words"

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
// ponytail: keeps the newest 500 settled items and drops older ones; archive them if long history matters.
// Never drops one still open in Approvals (a step the owner still owes, say).
function prune(held: HeldAction[]): HeldAction[] {
  const decided = held.filter((h) => !isOpenHeld(h))
  if (decided.length <= KEEP_DECIDED) return held
  const drop = new Set(decided.slice(0, decided.length - KEEP_DECIDED))
  return held.filter((h) => !drop.has(h))
}

/**
 * Blocks the same step being held twice, including an approved step the owner hasn't cleared yet
 * (else they might pay twice by hand). A failed or cleared one doesn't, so the job can offer it again.
 */
const waiting = (h: HeldAction) => (h.status === "pending" || h.status === "sending" || h.status === "approved") && !h.clearedAt

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
    // The job offered a failed send again: the new card replaces the old failure in Approvals.
    const again = new Set(added.map((a) => a.key))
    const at = input.now.toISOString()
    const kept = held.map((h) => (h.status === "failed" && !h.clearedAt && again.has(h.key) ? { ...h, clearedAt: at } : h))
    return { held: prune([...kept, ...added]), result: outcomes }
  })
}

export type DecideResult = { sent: number; failed: number; unrecorded: number; recorded: number; rejected: number; cleared: number; skipped: number }

/**
 * The owner's yes or no to the ids they were shown. Phase 1 claims under the lock (only one caller
 * can see an item `pending`), phase 2 sends outside it so a slow Outlook never blocks the tick, and
 * phase 3 records the result. Only phase 1 throws: past it a mail may have gone, so a failed record
 * is counted in `unrecorded` and the rest carry on. A failed send is never retried; rejecting a
 * failed send, an approved step the owner has done, or a send stuck past its timeout clears it.
 */
export async function decideHeld(
  store: JobStore,
  ids: string[],
  decision: "approve" | "reject",
  send: SendFn = outlookSend,
  now: () => Date = () => new Date()
): Promise<DecideResult> {
  const result: DecideResult = { sent: 0, failed: 0, unrecorded: 0, recorded: 0, rejected: 0, cleared: 0, skipped: 0 }
  const wanted = new Set(ids)
  const claimed = await store.updateHeld((held) => {
    const at = now().toISOString()
    const nowMs = now().getTime()
    const mine: HeldAction[] = []
    const seen = new Set<string>()
    const next = held.map((h) => {
      if (!wanted.has(h.id) || seen.has(h.id)) return h
      seen.add(h.id)
      const clearable = (h.status === "failed" || h.status === "approved") && !h.clearedAt
      if (decision === "reject" && (clearable || isStuckSending(h, nowMs))) {
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
    let sent = false
    try {
      await send(item.mail!)
      sent = true
      outcome = { status: "sent", sentAt: now().toISOString() }
    } catch (error) {
      // The owner is pointed at Connected tools; the CLI's own "or run: ..." is for a terminal, not them.
      const reason = (error as Error).message.replace(/,? or run: [\s\S]*$/, "").trim() || "Outlook didn't say why"
      outcome = { status: "failed", reason: /[.!?]$/.test(reason) ? reason : `${reason}.` }
    }
    try {
      await store.updateHeld((held) => ({ held: prune(held.map((h) => (h.id === item.id ? { ...h, ...outcome } : h))), result: null }))
      if (sent) result.sent++
      else result.failed++
    } catch {
      // It stays `sending`; once past the send timeout the owner can clear it after checking Outlook.
      result.unrecorded++
    }
  }
  return result
}

/** The result in two sentences: what went wrong (shown as an error) and everything else (shown plainly). */
export function decideMessage(r: DecideResult): { problem: string; rest: string } {
  const sentence = (parts: string[]) => (parts.length ? `${parts.join(", ")}.` : "")
  const problem = sentence(
    [
      r.failed ? `${r.failed} failed to send` : "",
      r.unrecorded ? `${r.unrecorded} may have been sent but couldn't be recorded: check Outlook's Sent folder before doing anything else` : "",
    ].filter(Boolean)
  )
  const parts = [
    r.sent ? `Sent ${r.sent}` : "",
    r.recorded ? `${r.recorded} approved for you to do yourself` : "",
    r.rejected ? `Rejected ${r.rejected}` : "",
    r.cleared ? `Cleared ${r.cleared}` : "",
    r.skipped ? `${r.skipped} already decided` : "",
  ].filter(Boolean)
  const tail = r.recorded ? " Alacrán can't carry these steps out itself: you do them." : ""
  const rest = sentence(parts) + tail
  return { problem, rest: rest || (problem ? "" : "Nothing changed.") }
}
