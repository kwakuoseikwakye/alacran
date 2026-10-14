import { readFile, readdir, unlink, realpath, lstat } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { resolveWithinAgentRoot } from "../path-guard"
import { getCompanyCommand } from "./registry"
import { lockReview } from "./review-lock"
import { checkRunLockStatus } from "./run-lock"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { isSafePostFileName } from "../content-social/posts"

/**
 * Discard ONE new file from a new-file-in-dir run, leaving the rest pending.
 * The per-file half of discardCompanyCommandResultImpl, which is whole-run
 * only; commit already works per file. Same containment: a name check, the
 * record must agree with the command, and a realpath check that the file sits
 * directly inside the command's output folder.
 */
export async function discardCompanyCommandFileImpl(
  commandId: string,
  agentId: string,
  fileName: string,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId)
): Promise<{ discarded: boolean; message: string }> {
  const command = getCompanyCommand(commandId)
  if (!command || command.outputKind !== "new-file-in-dir") return { discarded: false, message: "This kind of result can't be discarded one file at a time." }
  if (!isSafePostFileName(fileName)) return { discarded: false, message: "That isn't a file this job wrote." }
  if ((await checkRunLockStatus(dataDir)).running) return { discarded: false, message: "Changes are still being prepared. Wait until the work finishes, then review again." }

  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) return { discarded: false, message: `Unknown company "${agentId}"` }

  const releaseReview = await lockReview(dataDir, commandId)
  if (!releaseReview) return { discarded: false, message: "Changes are still being prepared. Review again when the work finishes." }
  try {
    const recordPath = path.join(dataDir, `${commandId}.run.json`)
    let record: { outputPath?: string; before?: unknown }
    try {
      record = JSON.parse(await readFile(recordPath, "utf-8"))
    } catch {
      return { discarded: false, message: "There's nothing waiting to be discarded." }
    }
    if (record.outputPath !== command.outputPath) return { discarded: false, message: `Refusing to discard a path outside "${command.id}"'s expected output location` }
    const before = Array.isArray(record.before) ? (record.before as string[]) : []
    if (before.includes(fileName)) return { discarded: false, message: "That post was already saved, so it can't be discarded here." }

    const outputAbs = await realpath(path.join(agent.rootPath, command.outputPath)).catch(() => null)
    const guard = await resolveWithinAgentRoot(path.join(agent.rootPath, command.outputPath, fileName))
    if (!outputAbs || !guard || path.dirname(guard.realPath) !== outputAbs) return { discarded: false, message: "That isn't a file this job wrote." }

    // Check that the file is a regular file, not a symlink or directory
    const stat = await lstat(path.join(agent.rootPath, command.outputPath, fileName)).catch(() => null)
    if (!stat || !stat.isFile()) return { discarded: false, message: "That isn't a file this job wrote." }

    await unlink(path.join(agent.rootPath, command.outputPath, fileName))
    const remaining = (await readdir(outputAbs).catch(() => [] as string[])).filter((n) => !before.includes(n) && isSafePostFileName(n))
    if (remaining.length === 0) await unlink(recordPath).catch(() => {})
    return { discarded: true, message: "Discarded this post." }
  } catch (err) {
    return { discarded: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    await releaseReview().catch(() => {})
  }
}
