import path from "node:path"
import { readFile } from "node:fs/promises"
import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (
  file: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>

/**
 * This module's own default, and it MUST NOT be `lib/default-exec-file.ts`.
 *
 * That one is `(command, args) => execFileAsync(command, args)` — two
 * parameters, and it silently discards a third. Passing it here type-checks
 * cleanly, because a function taking fewer arguments is assignable to a type
 * taking more, and then every `git status` runs in the SERVER's working
 * directory instead of the company's. The observed symptom was the stray-file
 * list coming back as the control-panel repo's own modified files, on every
 * run, for every company.
 *
 * `default-exec-file.ts`'s own comment already says the `{ cwd }`-taking
 * variants keep their own default. This is one of them.
 */
export const defaultCwdExecFile: ExecFileFn = (file, args, options) => execFileAsync(file, args, options)

/**
 * Every path in this repo that differs from HEAD right now — modified, added,
 * deleted, renamed or untracked — as repo-relative strings.
 *
 * This exists so the approval screen can say what a run REALLY touched, not
 * just what it was supposed to touch. Claude Code is confined by
 * `Edit(<outputPath>/**)` and cannot stray; an executor that reports
 * `enforcesToolScope: false` has no such confinement, and the diff the user
 * approves would otherwise show only the expected folder while other edits sat
 * unmentioned in the working tree. Reading git rather than walking the tree is
 * the whole trick: the company is already a git repo (registerCompanyImpl
 * requires `.git`), so "what changed" is a question already answered.
 *
 * Two flags are load-bearing and neither is cosmetic:
 *
 * `-z`  NUL-separated, so a filename containing a space, a newline or a quote
 *       parses correctly. Without it git QUOTES unusual paths ("a\nb") and the
 *       parser would have to unescape them — the same reasoning behind this
 *       project's \x1e/\x1f git-log delimiters.
 *
 * `-uall`  list untracked FILES, not the collapsed directory. Measured: on a
 *       company whose `notes/` is not yet committed, plain porcelain reports
 *       `?? notes/` for a write to `notes/company/digests/x.md` — which does
 *       not start with the output path, so the run's own legitimate output
 *       would be reported as a stray write on every fresh company.
 */
export async function listChangedPaths(rootPath: string, execFn: ExecFileFn): Promise<string[]> {
  const { stdout } = await execFn("git", ["status", "--porcelain", "-z", "-uall"], { cwd: rootPath })
  return parsePorcelainZ(stdout)
}

/**
 * Parse `git status --porcelain -z`.
 *
 * Each record is `XY <path>` NUL-terminated. A rename or copy (`R`/`C` in
 * either status column) is followed by a SECOND NUL-terminated field holding
 * the original path — measured against real git, not read from the man page.
 * Both halves are returned: a rename means the old path changed too, and a
 * command that renamed a file out of its lane has strayed just as surely as
 * one that wrote a new file there.
 */
export function parsePorcelainZ(stdout: string): string[] {
  const fields = stdout.split("\0")
  const paths: string[] = []
  for (let i = 0; i < fields.length; i++) {
    const record = fields[i]
    // Trailing empty field after the last NUL, and any blank padding.
    if (record.length < 4) continue
    const status = record.slice(0, 2)
    paths.push(record.slice(3))
    if (status.includes("R") || status.includes("C")) {
      // The original path is its own field; consume it so it is not parsed as
      // a status record on the next iteration.
      const original = fields[++i]
      if (original) paths.push(original)
    }
  }
  return paths
}

/**
 * Of everything that changed, which changes are NOT where this command was
 * supposed to write.
 *
 * `before` is what was already dirty when the run started — a user's own
 * uncommitted work must never be reported as the agent's doing. Anything that
 * was dirty before and is still dirty is therefore excluded, even if it sits
 * outside the output path.
 *
 * Comparison is on normalized repo-relative strings, and containment is
 * checked with a trailing separator so `notes/company/digests-old/x.md` is not
 * treated as living inside `notes/company/digests`.
 */
export function straysOutside(
  before: string[],
  after: string[],
  outputPath: string,
  alsoWrites: readonly string[] = []
): string[] {
  const wasDirty = new Set(before.map(normalize))
  const expected = normalize(outputPath)
  return after
    .map(normalize)
    .filter((p) => !wasDirty.has(p))
    .filter((p) => p !== expected && !p.startsWith(expected + "/"))
    .filter((p) => !isOwnedPath(p, alsoWrites))
    .sort()
}

/** Is this repo path one of a command's `alsoWrites` entries ("dir/" = anything inside, else exact)? */
export function isOwnedPath(p: string, alsoWrites: readonly string[]): boolean {
  const n = normalize(p)
  return alsoWrites.some((entry) =>
    entry.endsWith("/") ? n.startsWith(normalize(entry) + "/") : n === normalize(entry)
  )
}

/** The owned paths this run changed: dirty now, not dirty before, inside `alsoWrites`. */
export function ownedChanges(before: string[], after: string[], alsoWrites: readonly string[]): string[] {
  const wasDirty = new Set(before.map(normalize))
  return after.map(normalize).filter((p) => !wasDirty.has(p) && isOwnedPath(p, alsoWrites)).sort()
}

/**
 * The lanes a run's owned files are attributed in, and the "before" they are measured from (v234 C1).
 *
 * `beforeDirty` is the wrong baseline for this: a session note keeps its record (and so its
 * `beforeDirty`) for as long as it is unapproved, possibly days, and anything that touched
 * company.yaml or docs/decisions/ in that window would be attributed to the note, then reverted by
 * "drop" or committed by "approve all". `ownedBaseline` is the dirty set at the moment the agent was
 * actually asked to do lane work: written by `runCompanyCommandImpl` and by a LIVE session-note
 * prompt, never by the unattended one (whose scope cannot reach the lanes). A record without it gets
 * no lanes, so lane edits surface as strays and are never committed or dropped.
 */
export function ownedLanesFor(
  record: { ownedBaseline?: string[] | null },
  command: { alsoWrites?: readonly string[] } | undefined
): { lanes: string[]; baseline: string[] } {
  return Array.isArray(record.ownedBaseline) && command?.alsoWrites?.length
    ? { lanes: [...command.alsoWrites], baseline: record.ownedBaseline }
    : { lanes: [], baseline: [] }
}

/** The run's owned files right now: `ownedChanges` over its effective lanes, minus anything another pending review claims. */
export function ownedOf(
  record: { ownedBaseline?: string[] | null },
  command: { alsoWrites?: readonly string[] } | undefined,
  after: string[],
  claimed: (p: string) => boolean
): string[] {
  const { lanes, baseline } = ownedLanesFor(record, command)
  return ownedChanges(baseline, after, lanes).filter((p) => !claimed(p))
}

/**
 * Strays and owned from one git read. A lane path that is not owned (changed before the agent was
 * asked, claimed by another review, or on a record with no `ownedBaseline`) is a stray: shown, never
 * committed or dropped by this review.
 */
export function splitRunChanges(
  record: { beforeDirty: string[]; ownedBaseline?: string[] | null; outputPath: string },
  command: { alsoWrites?: readonly string[] } | undefined,
  after: string[],
  claimed: (p: string) => boolean
): { strays: string[]; owned: string[] } {
  const owned = ownedOf(record, command, after, claimed)
  const mine = new Set(owned)
  return { owned, strays: straysOutside(record.beforeDirty, after, record.outputPath).filter((p) => !mine.has(p)) }
}

export const OWNED_CHANGED_MESSAGE = "Some fact files changed since you opened this review. Reload and review again."

/**
 * Do the owned files on disk still match what the owner was shown? Same set of paths, and each file's
 * text equals the shown `newText` (a missing file or a directory (a nested repo, shown as empty) matches only an empty `newText`). Anything unreadable is a mismatch: refusing is safe, acting on unseen text is not.
 */
export async function ownedMatchesExpected(
  root: string,
  owned: string[],
  expected: { path: string; newText: string }[]
): Promise<boolean> {
  const want = new Map(expected.map((e) => [normalize(e.path), e.newText]))
  if (want.size !== expected.length || owned.length !== want.size || owned.some((p) => !want.has(normalize(p)))) return false
  for (const p of owned) {
    const now = await readFile(path.join(root, p), "utf-8").catch((err: NodeJS.ErrnoException) => (err.code === "ENOENT" || err.code === "EISDIR" ? "" : null))
    if (now !== want.get(normalize(p))) return false
  }
  return true
}

/**
 * `listChangedPaths` for exec functions that take no `cwd` (git-commit-file's shape): the repo is
 * named with `-C`, so a cwd-less exec cannot silently read the server's own repo instead.
 */
export async function listChangedPathsAt(
  rootPath: string,
  execFn: (command: string, args: string[]) => Promise<{ stdout: string }>
): Promise<string[]> {
  const { stdout } = await execFn("git", ["-C", rootPath, "status", "--porcelain", "-z", "-uall"])
  return parsePorcelainZ(stdout)
}

/** Repo-relative, forward slashes, no leading "./" — git already emits this
 *  shape, but outputPath comes from the registry and is compared against it. */
function normalize(p: string): string {
  return path.posix.normalize(p.replace(/\\/g, "/")).replace(/^\.\//, "").replace(/\/+$/, "")
}
