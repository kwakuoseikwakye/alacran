import { readdir, readFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import { listChangedPaths, splitRunChanges, defaultCwdExecFile, type ExecFileFn } from "./repo-changes"
import { pendingClaimedPaths } from "./pending-claims"
import { getCompanyCommand } from "./registry"
import { acquireRunLock, releaseRunLock } from "./run-lock"
import { explainAssistantFailure } from "../assistant/clean-stderr"
import { readableRunLog } from "../jobs/cost"

/**
 * `strays` is what the run changed OUTSIDE the folder it was supposed to write
 * to, and it is the honest half of this screen.
 *
 * Until it existed, the approval diff showed only the expected output path. For
 * Claude Code that is complete by construction — `Edit(<outputPath>/**)` makes
 * writing elsewhere impossible. For an executor that reports
 * `enforcesToolScope: false` it is not: the agent can touch anything in the
 * repo, and every one of those edits sat in the working tree unmentioned while
 * the user approved a diff that looked clean.
 *
 * `null` means "could not tell" and must never be rendered as "nothing
 * strayed": it is what a pre-upgrade run record (no `beforeDirty`) or an
 * unreadable git produces. Absent is unknown, never none — the same rule v75
 * settled for Google scopes, for the same reason.
 *
 * `ownedFiles` is what the run changed inside the command's `alsoWrites` lanes — files it is
 * allowed to touch beside its output (v234). Absent means none, not unknown.
 */
/** `isNew`: true = not in HEAD, false = in HEAD, null = could not tell (never read as new). */
export type OwnedFile = { path: string; oldText: string; newText: string; isNew: boolean | null }

export type CompanyCommandResult =
  | { changed: true; outputPath: string; oldText: string; newText: string; extraFiles: string[]; strays: string[] | null; ownedFiles?: OwnedFile[] }
  | { changed: false; message: string; strays: string[] | null }

type RunRecord = {
  commandId: string
  outputKind: "new-file-in-dir" | "known-file"
  outputPath: string
  before: string[] | string | null
  /** Absent on records written before this shipped. */
  beforeDirty?: string[] | null
  /** The dirty set when the agent was asked to do lane work (v234 C1). Absent = lanes off. */
  ownedBaseline?: string[] | null
}

/**
 * `computeStrayFiles: false` skips the git call and returns `strays: null`.
 *
 * It exists for exactly one caller — `listPendingReviews`, which runs in the
 * ROOT LAYOUT and therefore on every render of every page, once per run record
 * per company. It only ever reads `result.changed`, so the git spawn would be
 * pure waste at the highest-traffic point in the app. v70 is the slice about
 * a `force-dynamic` page's per-render subprocess cost; this is that question
 * asked before shipping rather than after.
 *
 * Default is true, so a new caller pays for correctness rather than silently
 * inheriting a blind spot.
 */
export async function getCompanyCommandResultImpl(
  commandId: string,
  dataDir: string,
  agentRootPath: string,
  execFn: ExecFileFn = defaultCwdExecFile,
  computeStrayFiles = true,
  sweep: SweepOptions = {}
): Promise<CompanyCommandResult> {
  const recordPath = path.join(dataDir, `${commandId}.run.json`)
  const seen = await readFile(recordPath, "utf-8").catch(() => null)
  const result = await readResult(commandId, dataDir, agentRootPath, execFn, computeStrayFiles)
  // v238: a finished run that changed nothing must not keep claiming its lanes (see below).
  if (seen !== null && !result.changed && result.strays?.length === 0) await dropEmptyRunRecord(commandId, dataDir, seen, sweep)
  return result
}

/** A render-time read only sweeps a record this old: younger may belong to a run that outlived the server. */
export const SWEEP_MIN_AGE_MS = 10 * 60 * 1000

export type SweepOptions = {
  /** The run just ended (the exit handler knows), so the age gate does not apply. */
  justFinished?: boolean
  now?: number
  /** Test seam: runs between the locked re-read and the delete. */
  beforeDelete?: () => Promise<void>
}

/**
 * A run record outlives its run so a pending review can wait, but a run that changed nothing (no
 * output, no owned files, no strays) has no review to wait for. Left behind, its `alsoWrites` lanes
 * stay claimed by `pendingClaimedPaths` and its output diff (against a stale `before`) would swallow a
 * later session's edits to the same file as a phantom review. Only commands with lanes, never a live
 * session's (its record is written before the agent has done anything). `strays` is `[]` only when git
 * was read, so unknown is never swept.
 *
 * The delete is a compare-and-delete under the run lock: a run that started since the read has written
 * a different record (or holds the lock), and its record is never removed. A reader that is not the run
 * itself ending also waits until the record is 10 minutes old, because a visible or detached run can
 * outlive the server and then its lock reads abandoned while it is still working.
 */
async function dropEmptyRunRecord(commandId: string, dataDir: string, seen: string, opts: SweepOptions): Promise<void> {
  const command = getCompanyCommand(commandId)
  if (!command?.alsoWrites?.length || command.requiresLiveSession) return
  const recordPath = path.join(dataDir, `${commandId}.run.json`)
  if (!opts.justFinished) {
    const info = await stat(recordPath).catch(() => null)
    if (!info || (opts.now ?? Date.now()) - info.mtimeMs < SWEEP_MIN_AGE_MS) return
  }
  if (!(await acquireRunLock(dataDir).catch(() => false))) return
  try {
    await opts.beforeDelete?.()
    if ((await readFile(recordPath, "utf-8").catch(() => null)) === seen) await rm(recordPath, { force: true })
  } catch {
    // A record that could not be removed stays; the next read tries again.
  } finally {
    await releaseRunLock(dataDir).catch(() => {})
  }
}

async function readResult(
  commandId: string,
  dataDir: string,
  agentRootPath: string,
  execFn: ExecFileFn,
  computeStrayFiles: boolean
): Promise<CompanyCommandResult> {
  let record: RunRecord
  try {
    const raw = await readFile(path.join(dataDir, `${commandId}.run.json`), "utf-8")
    record = JSON.parse(raw)
  } catch {
    return { changed: false, message: "No run recorded for this command yet.", strays: null }
  }

  // Computed before the output diff and reported on BOTH outcomes: a run that
  // produced no expected output but did edit three other files is the single
  // most important thing this screen can say, and it is exactly the case that
  // used to render as a bare "No changes produced."
  const { strays, owned } = computeStrayFiles
    ? await computeChanges(record, agentRootPath, execFn, dataDir, commandId)
    : { strays: null, owned: [] as string[] }
  const ownedFiles = owned.length ? await readOwned(agentRootPath, owned, execFn) : undefined
  const withOwned = ownedFiles ? { ownedFiles } : {}

  const absPath = path.join(agentRootPath, record.outputPath)

  if (record.outputKind === "new-file-in-dir") {
    const before = Array.isArray(record.before) ? record.before : []
    let current: string[]
    try {
      current = await readdir(absPath)
    } catch {
      current = []
    }
    const newFiles = current.filter((name) => !before.includes(name)).sort()
    if (newFiles.length === 0) {
      // Owned edits with no note beside them are not reviewable as an owned set, so they surface
      // as strays rather than vanishing.
      return { changed: false, message: await noChangeMessage(dataDir, commandId), strays: strays === null ? null : [...strays, ...owned].sort() }
    }
    const [primary, ...rest] = newFiles
    const newText = await readFile(path.join(absPath, primary), "utf-8")
    return {
      changed: true,
      outputPath: path.join(record.outputPath, primary),
      oldText: "",
      newText,
      extraFiles: rest,
      strays,
      ...withOwned,
    }
  }

  const before = typeof record.before === "string" ? record.before : ""
  let current: string
  try {
    current = await readFile(absPath, "utf-8")
  } catch {
    current = ""
  }
  if (current === before && !ownedFiles) {
    return { changed: false, message: await noChangeMessage(dataDir, commandId), strays }
  }
  return { changed: true, outputPath: record.outputPath, oldText: before, newText: current, extraFiles: [], strays, ...withOwned }
}

/**
 * One git read answers both questions: what the run touched outside its lanes (strays) and what
 * it changed inside its `alsoWrites` lanes (owned). Null strays still means "could not tell".
 *
 * Null on two paths, and both must stay null rather than becoming `[]`: a record written before
 * `beforeDirty` existed, and a git call that fails (not a repo, git missing). Reporting "no
 * strays" in either case would be the app asserting a safety property it did not check.
 */
async function computeChanges(
  record: RunRecord,
  root: string,
  execFn: ExecFileFn,
  dataDir: string,
  commandId: string
): Promise<{ strays: string[] | null; owned: string[] }> {
  if (!record.beforeDirty) return { strays: null, owned: [] }
  const beforeDirty = record.beforeDirty
  try {
    const after = await listChangedPaths(root, execFn)
    const claimed = await pendingClaimedPaths(dataDir, commandId)
    return splitRunChanges({ ...record, beforeDirty }, getCompanyCommand(record.commandId), after, claimed)
  } catch {
    return { strays: null, owned: [] }
  }
}

async function readOwned(root: string, paths: string[], execFn: ExecFileFn): Promise<OwnedFile[]> {
  return Promise.all(
    paths.map(async (p) => {
      // New only when HEAD really has no such path (empty ls-tree). A failed read (no HEAD yet, git
      // trouble) is unknown, never "new": the panel then uses neutral wording.
      let oldText = ""
      let isNew: boolean | null = null
      try {
        const inHead = (await execFn("git", ["--literal-pathspecs", "ls-tree", "--name-only", "HEAD", "--", p], { cwd: root })).stdout.trim() !== ""
        if (inHead) oldText = (await execFn("git", ["show", `HEAD:${p}`], { cwd: root })).stdout
        isNew = !inHead
      } catch {
        isNew = null
      }
      const newText = await readFile(path.join(root, p), "utf-8").catch(() => "")
      return { path: p, oldText, newText, isNew }
    })
  )
}

/**
 * "No changes produced." is right when the run worked and found nothing to
 * change, and wrong when the run never got going. The reason for the second
 * case is only in the log, which simple mode never shows after the run ends, so
 * a signed-out or missing AI read as "nothing to do". Only the last lines are
 * checked, where a failure lands, so a digest that merely mentions a "network
 * error" in its content is not mistaken for one.
 */
async function noChangeMessage(dataDir: string, commandId: string): Promise<string> {
  const fallback = "No changes produced."
  try {
    const log = await readFile(path.join(dataDir, `${commandId}.log`), "utf-8")
    const tail = readableRunLog(log).trim().split("\n").slice(-4).join("\n")
    const explained = explainAssistantFailure(tail, "The AI tool")
    return explained === tail ? fallback : explained
  } catch {
    return fallback
  }
}
