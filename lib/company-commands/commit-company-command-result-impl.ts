import { realpath, unlink } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { resolveWithinAgentRoot } from "../path-guard"
import { commitFile } from "../git-commit-file"
import type { ExecFileFn } from "../git-commit-file"
import { getCompanyCommand } from "./registry"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"

export type CommitCompanyCommandResult = { committed: boolean; message: string }

export async function commitCompanyCommandResultImpl(
  commandId: string,
  relativeOutputPath: string,
  agentId: string,
  execFn?: ExecFileFn,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId)
): Promise<CommitCompanyCommandResult> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { committed: false, message: `Unknown command "${commandId}"` }
  }

  // Cheap pre-check only: this runs on the raw, un-normalized string and can
  // be bypassed with "../" traversal (e.g. "docs/decisions/../../HANDOFF.md"
  // textually starts with "docs/decisions/"). It exists purely to fail fast
  // on obviously-wrong input without doing filesystem work. It must NEVER be
  // the sole gate — the authoritative decision is the realpath-based check
  // below, which runs on every input that passes this pre-check.
  const cheapIsWithinExpectedScope =
    command.outputKind === "new-file-in-dir"
      ? relativeOutputPath === command.outputPath || relativeOutputPath.startsWith(command.outputPath + path.sep)
      : relativeOutputPath === command.outputPath

  if (!cheapIsWithinExpectedScope) {
    return { committed: false, message: `Refusing to commit a path outside "${command.id}"'s expected output location` }
  }

  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { committed: false, message: `Unknown company "${agentId}"` }
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

  // Authoritative check: compare the fully-resolved absolute path against a
  // realpath'd version of the command's expected output location. This is
  // what actually gates whether commitFile runs — never the raw string
  // comparison above.
  const expectedOutputAbs = await realpath(path.join(agent.rootPath, command.outputPath)).catch(() => null)
  if (!expectedOutputAbs) {
    return { committed: false, message: `Refusing to commit — "${command.id}"'s expected output location doesn't exist` }
  }

  const isWithinExpectedScope =
    command.outputKind === "new-file-in-dir"
      ? guard.realPath === expectedOutputAbs || guard.realPath.startsWith(expectedOutputAbs + path.sep)
      : guard.realPath === expectedOutputAbs

  if (!isWithinExpectedScope) {
    return { committed: false, message: `Refusing to commit a path outside "${command.id}"'s expected output location` }
  }

  try {
    const relativeToRoot = path.relative(guard.agentRootPath, guard.realPath)
    await commitFile(guard.agentRootPath, relativeToRoot, `Run /${command.id} via AI-Native control panel`, execFn)
    // The run record is what makes an unapproved result *findable* after the
    // page that produced it is gone (lib/company-commands/pending-reviews.ts),
    // which is the whole reason a scheduled overnight run is reviewable at all.
    // Approving is therefore the moment it stops being pending — without this
    // every committed run would sit in that list forever. Best-effort: a commit
    // that really happened must not be reported as failed because a stale
    // bookkeeping file couldn't be removed.
    //
    // ponytail: for a command that wrote more than one new file this clears the
    // review for all of them, not just the one committed. The extras are named
    // in the UI ("Also created (not shown)") and still sit in the repo
    // uncommitted; per-file review is a bigger feature than this one.
    await unlink(path.join(dataDir, `${command.id}.run.json`)).catch(() => {})
    return { committed: true, message: "Committed" }
  } catch (err) {
    return { committed: false, message: err instanceof Error ? err.message : String(err) }
  }
}
