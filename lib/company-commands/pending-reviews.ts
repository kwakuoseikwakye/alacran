import { readdir } from "node:fs/promises"
import path from "node:path"
import type { Agent } from "../adapters/types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"

export type PendingReview = { agentId: string; commandId: string }

const RUN_RECORD_SUFFIX = ".run.json"

/**
 * Every run that produced changes nobody has approved yet.
 *
 * A run record survives the run that wrote it — that's what lets a scheduled
 * 07:00 digest still be sitting there when you sit down at 09:00. It stops
 * counting as pending when the result is committed, because the commit path
 * deletes the record (see commit-company-command-result-impl.ts); without
 * that, every approved run would show up here forever.
 */
export async function listPendingReviews(
  agents: Agent[],
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR
): Promise<PendingReview[]> {
  const perAgent = await Promise.all(
    agents.map(async (agent) => {
      const dataDir = path.join(dataRoot, agent.id)
      let files: string[]
      try {
        files = await readdir(dataDir)
      } catch {
        return []
      }
      const commandIds = files
        .filter((name) => name.endsWith(RUN_RECORD_SUFFIX))
        .map((name) => name.slice(0, -RUN_RECORD_SUFFIX.length))
      const results = await Promise.all(
        commandIds.map(async (commandId) => {
          const result = await getCompanyCommandResultImpl(commandId, dataDir, agent.rootPath)
          return result.changed ? { agentId: agent.id, commandId } : null
        })
      )
      return results.filter((r): r is PendingReview => r !== null)
    })
  )
  return perAgent.flat()
}
