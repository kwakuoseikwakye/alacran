import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"
import { commitCompanyCommandResultImpl } from "./commit-company-command-result-impl"
import type { CompanyCommandOutputKind } from "./types"
import { classifyRisk } from "./risk-tier"
import type { ExecFileFn } from "../git-commit-file"

export interface BatchReviewItem {
  commandId: string
  outputPath: string
  agentId: string
}

export interface BatchCommitResult {
  total: number
  committed: string[]
  failed: Array<{ key: string; error: string }>
  message: string
}

/**
 * Commits multiple pending command results that qualify as Tier 1 (Safe / Low Risk).
 *
 * Security Invariant: Every item is verified server-side via `classifyRisk`.
 * If an item is classified as Medium or High Risk, it is strictly rejected from
 * the batch commit and remains pending for individual gate review.
 */
export async function batchCommitSafeReviewsImpl(
  items: BatchReviewItem[],
  execFn?: ExecFileFn,
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR,
  /** See commitCompanyCommandResultImpl: injected, never defaulted. */
  afterCommit?: (dataDir: string, info: { commandId: string; outputKind: CompanyCommandOutputKind }) => Promise<void>
): Promise<BatchCommitResult> {
  const agents = await getEffectiveAgents()
  const committed: string[] = []
  const failed: Array<{ key: string; error: string }> = []

  for (const item of items) {
    const key = `${item.agentId}:${item.commandId}`
    const agent = agents.find((a) => a.id === item.agentId)
    if (!agent) {
      failed.push({ key, error: `Unknown company "${item.agentId}"` })
      continue
    }

    const dataDir = path.join(dataRoot, item.agentId)
    const result = await getCompanyCommandResultImpl(
      item.commandId,
      dataDir,
      agent.rootPath,
      execFn,
      true
    )

    if (!result.changed) {
      failed.push({ key, error: "No changes waiting to commit" })
      continue
    }

    // Authoritative Server-Side Gate Check:
    const risk = classifyRisk({
      commandId: item.commandId,
      outputPath: result.outputPath,
      oldText: result.oldText,
      newText: result.newText,
      extraFiles: result.extraFiles,
      strays: result.strays,
      ownedPaths: result.ownedFiles?.map((f) => f.path),
    })

    if (!risk.isSafe || result.extraFiles.length > 0 || (result.ownedFiles?.length ?? 0) > 0) {
      failed.push({
        key,
        error: `Refusing to batch-approve item categorized as ${risk.label}: ${risk.reason}`,
      })
      continue
    }

    const commitRes = await commitCompanyCommandResultImpl(
      item.commandId,
      result.outputPath,
      item.agentId,
      execFn,
      dataDir,
      result.newText,
      afterCommit
    )

    if (commitRes.committed) {
      committed.push(key)
    } else {
      failed.push({ key, error: commitRes.message })
    }
  }

  const message =
    committed.length > 0 && failed.length === 0
      ? `Approved and committed ${committed.length} safe change${committed.length === 1 ? "" : "s"}.`
      : committed.length > 0 && failed.length > 0
        ? `Committed ${committed.length} change${committed.length === 1 ? "" : "s"}, ${failed.length} failed or required individual review.`
        : failed.length > 0
          ? `Could not batch commit: ${failed[0].error}`
          : "No reviews were processed."

  return {
    total: items.length,
    committed,
    failed,
    message,
  }
}
