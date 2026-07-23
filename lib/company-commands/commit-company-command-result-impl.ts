import { realpath } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "../config"
import { resolveWithinAgentRoot } from "../path-guard"
import { commitFile } from "../git-commit-file"
import type { ExecFileFn } from "../git-commit-file"
import { getCompanyCommand } from "./registry"

const AI_COMPANY_STARTER_MAIN_ID = "ai-company-starter-main"

export type CommitCompanyCommandResult = { committed: boolean; message: string }

export async function commitCompanyCommandResultImpl(
  commandId: string,
  relativeOutputPath: string,
  execFn?: ExecFileFn
): Promise<CommitCompanyCommandResult> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { committed: false, message: `Unknown command "${commandId}"` }
  }

  const isWithinExpectedScope =
    command.outputKind === "new-file-in-dir"
      ? relativeOutputPath === command.outputPath || relativeOutputPath.startsWith(command.outputPath + path.sep)
      : relativeOutputPath === command.outputPath

  if (!isWithinExpectedScope) {
    return { committed: false, message: `Refusing to commit a path outside "${command.id}"'s expected output location` }
  }

  const agent = AGENTS.find((a) => a.id === AI_COMPANY_STARTER_MAIN_ID)
  if (!agent) {
    return { committed: false, message: `Agent "${AI_COMPANY_STARTER_MAIN_ID}" is not configured` }
  }

  let expectedRoot: string
  try {
    expectedRoot = await realpath(agent.rootPath)
  } catch (err) {
    return { committed: false, message: err instanceof Error ? err.message : String(err) }
  }

  const absolutePath = path.join(agent.rootPath, relativeOutputPath)
  const guard = await resolveWithinAgentRoot(absolutePath)
  if (!guard || guard.agentRootPath !== expectedRoot) {
    return { committed: false, message: "Refusing to commit a path outside the configured agent root" }
  }

  try {
    const relativeToRoot = path.relative(guard.agentRootPath, guard.realPath)
    await commitFile(guard.agentRootPath, relativeToRoot, `Run /${command.id} via AI-Native control panel`, execFn)
    return { committed: true, message: "Committed" }
  } catch (err) {
    return { committed: false, message: err instanceof Error ? err.message : String(err) }
  }
}
