import { lstat, readFile, realpath, unlink } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { resolveWithinAgentRoot } from "../path-guard"
import { defaultExecFile } from "../default-exec-file"
import type { ExecFileFn } from "../git-commit-file"
import { getCompanyCommand } from "./registry"
import type { CompanyCommand } from "./types"
import { lockReview } from "./review-lock"
import { checkRunLockStatus } from "./run-lock"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { listChangedPathsAt, ownedOf, ownedLanesFor, ownedMatchesExpected, OWNED_CHANGED_MESSAGE } from "./repo-changes"
import { pendingClaimedPaths } from "./pending-claims"

export const FAILED_TO_DROP = "Couldn't finish dropping the fact changes. Some may already be dropped, so check again before approving."
const PARTIAL_BEFORE_APPROVING = "Dropped most of the fact changes. Some couldn't be dropped safely, so check them before approving."
const PARTIAL_DISCARD = "Dropped most of the fact changes. Some couldn't be dropped safely, so nothing else was discarded. Check them, then discard again."

/** The review the drop button leaves behind: the note for a session note; for an apply, whatever the output still holds. */
export const droppedMessage = (commandId: string, outputUnchanged = false) =>
  commandId !== "apply-session-facts"
    ? "Dropped the fact changes. The note is still waiting for you."
    : outputUnchanged
      ? "Dropped the fact changes. Nothing is left in this review."
      : "Dropped the fact changes. The rest of this review is still waiting for you."

/**
 * Drop a run's changes to its `alsoWrites` paths and keep everything else, including the run record,
 * so the primary output (the session note) stays waiting for review. A path that exists in HEAD is
 * restored from HEAD (index and working tree both); one the run created is deleted. Anything already
 * dirty before the agent was asked (`ownedBaseline`), or claimed by another pending review, is never
 * touched (see `ownedLanesFor`). With `expectedOwned` (what the owner was shown), it refuses unless the
 * owned set and every file's text still match, so it only ever drops what was reviewed.
 *
 * Each path is guarded the way approval guards it (commit-company-command-result-impl.ts): lstat first,
 * because `resolveWithinAgentRoot` returns null for a missing file and for an escape alike, and a link
 * in an owned lane can point anywhere. A symlink is only ever removed as a link, never through its target.
 */
export async function discardOwnedChangesImpl(
  commandId: string,
  agentId: string,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId),
  execFn: ExecFileFn = defaultExecFile,
  expectedOwned?: { path: string; newText: string }[]
): Promise<{ discarded: boolean; message: string }> {
  // Everything sits inside the try: the server action is a bare re-export, so a throw that escaped
  // would reach the owner as Next's redacted digest. The message is fixed on purpose — an error's own
  // text carries absolute paths and git output — and says "may already be dropped" because a throw
  // part-way through the loop leaves the earlier paths done.
  let release: (() => Promise<void>) | null = null
  try {
    const command = getCompanyCommand(commandId)
    if (!command?.alsoWrites?.length) return { discarded: false, message: "This kind of result has no fact changes to drop." }
    if ((await checkRunLockStatus(dataDir)).running) return { discarded: false, message: "Changes are still being prepared. Wait until the work finishes, then review again." }
    const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
    if (!agent) return { discarded: false, message: `Unknown company "${agentId}"` }

    release = await lockReview(dataDir, commandId)
    if (!release) return { discarded: false, message: "Changes are still being prepared. Review again when the work finishes." }
    const record = await readFile(path.join(dataDir, `${commandId}.run.json`), "utf-8")
      .then((raw) => JSON.parse(raw) as { ownedBaseline?: string[] | null })
      .catch(() => null)
    if (!record) return { discarded: false, message: "There's nothing waiting to be discarded." }
    if (!ownedLanesFor(record, command).lanes.length) return { discarded: false, message: "Couldn't tell which changes were the agent's, so nothing was dropped." }

    const { discarded, message } = await dropOwnedLocked(command, await realpath(agent.rootPath), record, dataDir, execFn, expectedOwned)
    return { discarded, message }
  } catch {
    return { discarded: false, message: FAILED_TO_DROP }
  } finally {
    await release?.().catch(() => {})
  }
}

/**
 * The drop itself, for a caller that already holds this review's lock: the "drop fact changes" button
 * above, and whole-review Discard (discard-company-command-result-impl.ts). Throws on a git or file
 * failure; each caller turns that into its own plain sentence. `partial` means some owned paths were
 * left in place because they could not be dropped safely.
 */
export async function dropOwnedLocked(
  command: CompanyCommand,
  root: string,
  record: { ownedBaseline?: string[] | null; before?: unknown },
  dataDir: string,
  execFn: ExecFileFn,
  expectedOwned?: { path: string; newText: string }[],
  wholeReview = false
): Promise<{ discarded: boolean; message: string; partial?: true }> {
  const owned = ownedOf(record, command, await listChangedPathsAt(root, execFn), await pendingClaimedPaths(dataDir, command.id))
  // Owned files present means the owner must say what they saw; none present means nothing to check (v238).
  if (owned.length > 0 && !expectedOwned) return { discarded: false, message: OWNED_CHANGED_MESSAGE }
  if (expectedOwned && !(await ownedMatchesExpected(root, owned, expectedOwned))) return { discarded: false, message: OWNED_CHANGED_MESSAGE }
  if (owned.length === 0) return { discarded: false, message: "There are no fact changes to drop." }

  // `--literal-pathspecs`: a file the run named `*` or `[x]` must not be read as a glob that reaches
  // the owner's own uncommitted edits in the same lane.
  const git = (...args: string[]) => execFn("git", ["--literal-pathspecs", "-C", root, ...args])
  // Only a repo with no commits yet has nothing in HEAD (`rev-parse --verify --quiet` exits 1 for that).
  // Any other failure throws: "could not look" must never read as "not in HEAD", which would delete a tracked file.
  const unborn = await git("rev-parse", "--verify", "--quiet", "HEAD").then(() => false, (err: { code?: unknown }) => {
    if (err?.code === 1) return true
    throw err
  })
  let skipped = 0
  for (const p of owned) {
    const abs = path.join(root, p)
    const info = await lstat(abs).catch((err: NodeJS.ErrnoException) => (err.code === "ENOENT" ? null : undefined))
    // Not a file or a link (a nested repo shows up as a directory): not ours to remove.
    if (info === undefined || (info && !info.isFile() && !info.isSymbolicLink())) {
      skipped++
      continue
    }
    if (!unborn && (await git("ls-tree", "--name-only", "HEAD", "--", p)).stdout.trim() !== "") {
      await git("checkout", "HEAD", "--", p)
      continue
    }
    // Not in HEAD: the run created it. A link goes as a link; a file only if it really sits in this company.
    if (info?.isSymbolicLink()) await unlink(abs)
    else if (info) {
      const guard = await resolveWithinAgentRoot(abs)
      if (!guard || guard.agentRootPath !== root) {
        skipped++
        continue
      }
      await unlink(guard.realPath)
    }
    await git("rm", "-q", "--cached", "--ignore-unmatch", "--", p) // a staged add would otherwise outlive the file
  }
  return skipped
    ? { discarded: true, message: wholeReview ? PARTIAL_DISCARD : PARTIAL_BEFORE_APPROVING, partial: true }
    : { discarded: true, message: droppedMessage(command.id, command.outputKind === "known-file" && typeof record.before === "string" && (await readFile(path.join(root, command.outputPath), "utf-8").catch(() => "")) === record.before) }
}
