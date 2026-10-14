"use server"

import { revalidatePath } from "next/cache"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { commitFile } from "@/lib/git-commit-file"
import { defaultExecFile } from "@/lib/default-exec-file"
import { withFileLock } from "@/lib/os/departments/safety"
import { lockKey } from "@/lib/os/departments/mutations"
import { guideStateDir } from "./observe"
import { clearDismissed, isProposalId, recordDismissed, recordPending } from "./proposal-state"
import { addGuide, AGENTS_REL, refreshGuideIfUnchanged } from "./refresh"

type Failure = { ok: false; code: string; error: string }
type GuideActionResult = { ok: true; committed: boolean; commitError?: string; changed: boolean } | Failure
type SimpleResult = { ok: true } | Failure

type Deps = {
  resolveRoot: (id: string) => Promise<string | null>
  revalidate: (path: string) => void
  /** Where the small pending/dismissed state lives; tests point it at a temp directory. */
  stateDir?: (id: string) => string
}

async function defaultResolveRoot(companyId: string): Promise<string | null> {
  return (await getEffectiveAgents()).find((a) => a.id === companyId)?.rootPath ?? null
}
const defaults: Deps = { resolveRoot: defaultResolveRoot, revalidate: revalidatePath as (p: string) => void }
const unknown = (id: string): Failure => ({ ok: false, code: "not-found", error: `Company not found: ${id}` })
const crashed: Failure = { ok: false, code: "failed", error: "The operating guide could not be updated." }
const invalid: Failure = { ok: false, code: "invalid", error: "That guide update isn't valid." }

/** Approving, dismissing or reopening changes what Home, Approvals and Skills show. */
function revalidateGuide(deps: Deps, companyId: string): void {
  for (const page of ["skills", "tasks", "dashboard"]) deps.revalidate(`/c/${companyId}/${page}`)
}

/** First line only, no paths, capped: raw git output never reaches the UI. */
function plainGitError(err: unknown): string {
  const first = (err instanceof Error ? err.message : String(err)).split("\n").map((l) => l.trim()).find(Boolean) ?? ""
  const clean = first.replace(/(\/[^\s'"]+)+/g, "").replace(/\s+/g, " ").trim().slice(0, 120)
  return `Saved locally, but the history update failed${clean ? `: ${clean}` : "."}`
}

async function commitGuide(root: string, text: string): Promise<{ committed: boolean; commitError?: string }> {
  try {
    await commitFile(root, [AGENTS_REL], text, defaultExecFile)
    return { committed: true }
  } catch (err) {
    return { committed: false, commitError: plainGitError(err) }
  }
}

export async function addGuideActionImpl(companyId: string, deps: Deps = defaults): Promise<GuideActionResult> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    return await withFileLock(lockKey(root), async (): Promise<GuideActionResult> => {
      const added = await addGuide(root, { exec: defaultExecFile })
      if (!added.ok) return { ok: false, code: added.code, error: added.error }
      const saved = await commitGuide(root, "docs: add the operating guide")
      deps.revalidate(`/c/${companyId}/skills`)
      return { ok: true, changed: true, ...saved }
    })
  } catch {
    return crashed
  }
}

/**
 * The only place a stale guide is rewritten. `expected` is what the owner was shown: the proposal id (the body
 * hash of the block that would be written) and the base (the body hash of the block then on disk). If either
 * no longer matches, nothing is written and the caller shows the new proposal. The check and the write use ONE
 * evaluation (refreshGuideIfUnchanged), so the block written is exactly the one whose id was approved.
 */
export async function approveGuideProposalActionImpl(
  companyId: string,
  expected: { id: string; baseBodyHash: string },
  deps: Deps = defaults
): Promise<GuideActionResult> {
  try {
    if (!expected || !isProposalId(expected.id) || !isProposalId(expected.baseBodyHash)) return invalid
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    const dir = (deps.stateDir ?? guideStateDir)(companyId)
    return await withFileLock(lockKey(root), async (): Promise<GuideActionResult> => {
      const result = await refreshGuideIfUnchanged(root, { exec: defaultExecFile }, expected)
      if (result.status === "needs-attention") return { ok: false, code: result.reason, error: result.detail }
      if (result.status === "failed") return { ok: false, code: "failed", error: result.error }
      if (result.status === "changed") {
        return { ok: false, code: "changed", error: "Things changed while you were reading. Here are the new changes." }
      }
      await recordPending(dir, null).catch(() => {})
      if (result.status !== "updated") {
        revalidateGuide(deps, companyId)
        return { ok: true, changed: false, committed: true }
      }
      const saved = await commitGuide(root, "docs: update the operating guide")
      revalidateGuide(deps, companyId)
      return { ok: true, changed: true, ...saved }
    })
  } catch {
    return crashed
  }
}

/** "Not now": remember this exact version. AGENTS.md is never touched. */
export async function dismissGuideProposalActionImpl(companyId: string, id: string, deps: Deps = defaults): Promise<SimpleResult> {
  try {
    if (!isProposalId(id)) return invalid
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    const dir = (deps.stateDir ?? guideStateDir)(companyId)
    return await withFileLock(lockKey(root), async (): Promise<SimpleResult> => {
      await recordDismissed(dir, id)
      revalidateGuide(deps, companyId)
      return { ok: true }
    })
  } catch {
    return crashed
  }
}

/** "Review changes again": forget the dismissal so the proposal shows again. */
export async function reopenGuideProposalActionImpl(companyId: string, deps: Deps = defaults): Promise<SimpleResult> {
  try {
    const root = await deps.resolveRoot(companyId)
    if (!root) return unknown(companyId)
    const dir = (deps.stateDir ?? guideStateDir)(companyId)
    return await withFileLock(lockKey(root), async (): Promise<SimpleResult> => {
      await clearDismissed(dir)
      revalidateGuide(deps, companyId)
      return { ok: true }
    })
  } catch {
    return crashed
  }
}

// Thin server-action exports; tests drive the Impls above.
export async function addGuideAction(companyId: string) { return addGuideActionImpl(companyId) }
export async function approveGuideProposalAction(companyId: string, expected: { id: string; baseBodyHash: string }) {
  return approveGuideProposalActionImpl(companyId, expected)
}
export async function dismissGuideProposalAction(companyId: string, id: string) { return dismissGuideProposalActionImpl(companyId, id) }
export async function reopenGuideProposalAction(companyId: string) { return reopenGuideProposalActionImpl(companyId) }
