import { realpath, unlink, readFile, readdir, writeFile, lstat } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { resolveWithinAgentRoot } from "../path-guard"
import { commitFile } from "../git-commit-file"
import type { ExecFileFn } from "../git-commit-file"
import { getCompanyCommand } from "./registry"
import type { CompanyCommandOutputKind } from "./types"
import { lockReview } from "./review-lock"
import { checkRunLockStatus } from "./run-lock"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { isSafePostFileName } from "../content-social/posts"
import { listChangedPathsAt, ownedOf, ownedLanesFor, ownedMatchesExpected, OWNED_CHANGED_MESSAGE } from "./repo-changes"
import { pendingClaimedPaths } from "./pending-claims"
import { defaultExecFile } from "../default-exec-file"

export type CommitCompanyCommandResult = { committed: boolean; message: string }

export async function commitCompanyCommandResultImpl(
  commandId: string,
  relativeOutputPath: string,
  agentId: string,
  execFn?: ExecFileFn,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId),
  expectedText?: string,
  /**
   * Runs once, after the commit has landed, with this company's run-data
   * directory. Injected and never defaulted here: a test that commits must not
   * be able to write app state, so the two server actions that stand for a
   * person approving pass the real one and everything else passes nothing.
   * Whatever it does, it cannot fail an approval that already happened.
   */
  afterCommit?: (dataDir: string, info: { commandId: string; outputKind: CompanyCommandOutputKind }) => Promise<void>,
  /**
   * The owned files the owner was shown (path and text). When given, the commit refuses unless the
   * owned set and every file's content still match exactly — so "Approve all" commits only what was
   * reviewed (v234 C1). Absent keeps the older behaviour for callers that never showed owned files.
   */
  expectedOwned?: { path: string; newText: string }[]
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

  if ((await checkRunLockStatus(dataDir)).running) return { committed: false, message: "Changes are still being prepared. Wait until the work finishes, then review again." }

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

  const releaseReview = await lockReview(dataDir, commandId)
  if (!releaseReview) return { committed: false, message: "Changes are still being prepared. Review again when the work finishes." }
  try {
    if (expectedText !== undefined && await readFile(guard.realPath, "utf-8") !== expectedText) return { committed: false, message: "The proposal changed since you opened it. Refresh and review the latest version." }
    const relativeToRoot = path.relative(guard.agentRootPath, guard.realPath)
    const recordPath = path.join(dataDir, `${command.id}.run.json`)
    const record = await readFile(recordPath, "utf-8").then((raw) => JSON.parse(raw)).catch(() => null) as
      { ownedBaseline?: string[] | null; trailer?: string } | null
    // What the run changed inside its `alsoWrites` lanes since the agent was asked (ownedBaseline),
    // committed with the output. Anything dirty before that, or claimed by another pending review, is
    // not this run's and is never swept in (see ownedLanesFor).
    const owned: string[] = []
    const candidates = record && ownedLanesFor(record, command).lanes.length
      ? ownedOf(record, command, await listChangedPathsAt(guard.agentRootPath, execFn ?? defaultExecFile), await pendingClaimedPaths(dataDir, command.id))
      : []
    // Required whenever fact files are owned: approving must commit only the text the owner was shown (v238).
    if (candidates.length > 0 && !expectedOwned) return { committed: false, message: OWNED_CHANGED_MESSAGE }
    if (expectedOwned && !(await ownedMatchesExpected(guard.agentRootPath, candidates, expectedOwned))) {
      return { committed: false, message: OWNED_CHANGED_MESSAGE }
    }
    for (const p of candidates) {
      // `resolveWithinAgentRoot` returns null both for a missing file and for a path that lands
      // outside every company, so it cannot tell a deletion from an escape. lstat can: it does not
      // follow links. ENOENT is a file the run deleted (`p` came from git status of this root, so it
      // is inside it) and is kept so the deletion lands in the commit. A symlink is skipped whatever
      // it points at, since a link in an owned lane can reach outside the company. Anything else must
      // resolve inside this root.
      const abs = path.join(guard.agentRootPath, p)
      const info = await lstat(abs).catch((err: NodeJS.ErrnoException) => (err.code === "ENOENT" ? null : undefined))
      if (info === undefined) continue
      if (info) {
        // A directory (a nested repo) cannot be committed as a file; the drop path skips it the same way.
        if (!info.isFile() && !info.isSymbolicLink()) continue
        if (info.isSymbolicLink()) continue
        const ownedGuard = await resolveWithinAgentRoot(abs)
        if (!ownedGuard || ownedGuard.agentRootPath !== expectedRoot) continue
      }
      owned.push(p)
    }
    const message = `Run /${command.id} via AI-Native control panel` + (record?.trailer ? `\n\n${record.trailer}` : "")
    await commitFile(guard.agentRootPath, [relativeToRoot, ...owned], message, execFn)
    try {
      await afterCommit?.(dataDir, { commandId: command.id, outputKind: command.outputKind })
    } catch {
      // A bookkeeping marker that could not be written must not turn a saved approval into a reported failure.
    }
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
    if (command.outputKind === "new-file-in-dir") {
      try {
        const record = JSON.parse(await readFile(recordPath, "utf-8"))
        const before: string[] = Array.isArray(record.before) ? record.before : []
        const reviewed = path.basename(relativeToRoot)
        const remaining = (await readdir(expectedOutputAbs)).filter((name) => name !== reviewed && !before.includes(name) && isSafePostFileName(name))
        if (remaining.length > 0) {
          await writeFile(recordPath, JSON.stringify({ ...record, before: [...before, reviewed] }), "utf-8")
          return { committed: true, message: "Saved this document. Other documents still need your review." }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { committed: true, message: "Saved. Please refresh to check whether more documents need review." }
      }
    }
    await unlink(recordPath).catch(() => {})
    return { committed: true, message: "Committed" }
  } catch (err) {
    return { committed: false, message: err instanceof Error ? err.message : String(err) }
  } finally { await releaseReview().catch(() => {}) }
}
