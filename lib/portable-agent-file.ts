import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathExists } from "./path-exists"
import { getEffectiveAgents } from "./get-effective-agents"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

/**
 * Move a company's working agreement from `CLAUDE.md` to `AGENTS.md`, the
 * filename Codex, Aider, Antigravity and Cursor all read, and leave a pointer
 * behind for Claude Code.
 *
 * Companies scaffolded before this shipped have their standing context under
 * one vendor's filename, so "bring your own agent" only ever held for one of
 * the four executors: the others spawned fine and started with no idea what
 * the business was. This is the one-time fix for those.
 *
 * A rename, deliberately, not a copy. Two files both claiming to be the
 * working agreement is exactly the drift the company template's own §1 rule
 * ("never make the core depend on the adapter") exists to prevent — and the
 * user's own edits to CLAUDE.md are the thing being carried over, so they
 * have to move rather than be duplicated beside a stale twin.
 */

export const AGENTS_FILE = "AGENTS.md"
export const CLAUDE_FILE = "CLAUDE.md"

/**
 * Single source of truth for the pointer, asserted against the real template
 * file by this module's test. A copy of this prose living only in
 * templates/company-starter/CLAUDE.md would drift the first time either is
 * edited, and the drift would be invisible: both files would still look
 * perfectly reasonable on their own.
 */
export const CLAUDE_POINTER = `@AGENTS.md

The working agreement for this repository lives in \`AGENTS.md\`, under the
filename every agent reads rather than one vendor's. The line above imports
it; if your tool doesn't support that syntax, read \`AGENTS.md\` now.
`

/**
 * Cheap enough for the card render path: two stats, no subprocess.
 * True only when there is really something to move — a company that already
 * has AGENTS.md, or never had a working agreement at all, offers nothing.
 */
export async function needsPortableAgentFile(rootPath: string): Promise<boolean> {
  if (await pathExists(path.join(rootPath, AGENTS_FILE))) return false
  return pathExists(path.join(rootPath, CLAUDE_FILE))
}

export async function addPortableAgentFileImpl(
  agentId: string,
  execFn?: ExecFileFn
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }
  // Same gate as every other company feature: an `external` folder is someone
  // else's repo that this app was merely pointed at, and this one writes and
  // commits two files at its root.
  if (agent.kind !== "command-set") {
    return { ok: false, message: "This kind of folder has no working agreement to move" }
  }

  const agentsPath = path.join(agent.rootPath, AGENTS_FILE)
  const claudePath = path.join(agent.rootPath, CLAUDE_FILE)

  // Never overwrite an AGENTS.md. If one is there, it is the user's, and it
  // is already the thing this feature exists to produce.
  if (await pathExists(agentsPath)) {
    return { ok: false, message: "This company already has an AGENTS.md" }
  }

  let workingAgreement: string
  try {
    workingAgreement = await readFile(claudePath, "utf-8")
  } catch {
    return { ok: false, message: "This company has no CLAUDE.md to move" }
  }

  // AGENTS.md first. If the process dies between the two writes, the repo is
  // left with the working agreement under both names — untidy, but every
  // agent still reads the right content. The other order would leave it under
  // neither, with the original replaced by a pointer to a file that does not
  // exist.
  await writeFile(agentsPath, workingAgreement, "utf-8")
  await writeFile(claudePath, CLAUDE_POINTER, "utf-8")

  // One commit, both paths, still pathspec-scoped — git records it as the
  // rename it is, so the user can read and revert it as a single change.
  await commitFile(
    agent.rootPath,
    [AGENTS_FILE, CLAUDE_FILE],
    "Move working agreement to AGENTS.md so any agent reads it",
    execFn
  )
  return { ok: true }
}
