import path from "node:path"
import { COMPANY_COMMANDS_DATA_DIR } from "@/lib/company-commands/paths"
import { defaultExecFile } from "@/lib/default-exec-file"
import type { ExecFileFn } from "@/lib/git-commit-file"
import { PACKS_ROOT } from "./inventory"
import { proposeGuide } from "./proposal"
import type { ProposalResult } from "./proposal"
import { isDismissed, pendingCountOf, readGuideProposalState, recordPending } from "./proposal-state"

export type GuideView = { result: ProposalResult; dismissed: boolean }

/** The company's run-data directory, where `first-run.json` already lives. */
export const guideStateDir = (agentId: string): string => path.join(COMPANY_COMMANDS_DATA_DIR, agentId)

/**
 * What Home, Approvals and Skills show about the guide. Read-only for the company: it never touches
 * AGENTS.md. It only keeps the small "pending" flag in step (set for a proposal, cleared otherwise,
 * written only when it changes) so the sidebar badge can count a proposal without recomputing it.
 * Never throws.
 */
export async function observeGuide(
  agent: { id: string; rootPath: string },
  opts: { dir?: string; exec?: ExecFileFn; packsRoot?: string } = {}
): Promise<GuideView> {
  const dir = opts.dir ?? guideStateDir(agent.id)
  const result = await proposeGuide(agent.rootPath, { exec: opts.exec ?? defaultExecFile, packsRoot: opts.packsRoot ?? PACKS_ROOT })
  // The flag is only a convenience for the badge: a failed write must not also cost the owner their "Not now".
  await recordPending(dir, result.kind === "proposal" ? result.proposal.id : null).catch(() => {})
  const state = await readGuideProposalState(dir) // never throws
  return { result, dismissed: result.kind === "proposal" && isDismissed(state, result.proposal.id) }
}

/** A file read, no scan: 1 when a proposal is pending and not dismissed. Used by both layouts for the badge. */
export async function guidePendingCount(agentId: string, dir: string = guideStateDir(agentId)): Promise<0 | 1> {
  return pendingCountOf(await readGuideProposalState(dir))
}
