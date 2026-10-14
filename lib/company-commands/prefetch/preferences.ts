import { hasPendingPreferenceReview } from "@/lib/os/preferences/pending"
import { offerFrom, readCursor, writeCursor } from "@/lib/os/preferences/offer"
import { readOutcomes, WITHHELD } from "@/lib/os/preferences/outcomes"
import { fenceNotice, fenceUntrusted, newFenceNonce } from "./untrusted-fence"
import type { PrefetchContext, PrefetchResult } from "./types"

const oneLine = (s: string) => s.replace(/[\s\u0085\u2028\u2029]+/g, " ").trim()
const MAX_PER_COMMAND = 20
const NOTHING = "There's no new feedback to learn from yet."

/**
 * The owner's recent revision feedback, grouped by the command that produced the draft, inside the
 * nonced untrusted-text fence: it is the owner's own words, but it can quote customers or paste text
 * from outside, and this command EDITS a file, so the fence belongs to the use. The cursor moves only
 * when the run actually starts (onRunStart), so a refusal costs nothing and loses nothing.
 */
export async function buildPreferencesPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  if (!ctx.dataDir) return { ok: false, message: NOTHING }
  const dataDir = ctx.dataDir
  if (await hasPendingPreferenceReview(dataDir, ctx.agentRootPath)) return { ok: false, message: "Your last suggestions are still waiting in Approvals." }
  const cursor = await readCursor(dataDir)
  const { entries, offset } = await readOutcomes(dataDir, cursor)
  if (!offerFrom(entries)) return { ok: false, message: NOTHING }
  const byCommand = new Map<string, string[]>()
  for (const e of entries) {
    // A withheld entry has no content to learn from; the cursor still passes it.
    if (e.command === "learn-preferences") continue // never learn from its own reviews
    if (e.outcome !== "revised" || !e.feedback || e.feedback === WITHHELD) continue
    byCommand.set(e.command, [...(byCommand.get(e.command) ?? []), oneLine(e.feedback)])
  }
  if (byCommand.size === 0) return { ok: false, message: NOTHING }

  const nonce = newFenceNonce()
  const groups = [...byCommand]
    .map(([command, all]) => [command, all.slice(-MAX_PER_COMMAND)] as const) // keep the prompt bounded: most recent only
    .map(([command, notes]) => `${command} (${notes.length} ${notes.length === 1 ? "revision" : "revisions"})\n${notes.map((n) => `- "${n}"`).join("\n")}`)
    .join("\n\n")
  const text = `${fenceNotice(nonce, "the owner's own change requests on drafts, which may quote customers or text pasted from elsewhere.")}\n${fenceUntrusted(groups, nonce)}`
  return { ok: true, text, onRunStart: () => writeCursor(dataDir, offset) }
}
