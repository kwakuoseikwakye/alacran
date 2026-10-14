import { gitCommit, type ExecFileFn } from "../git-commit-file"

export type RunChange = { status: "A" | "M" | "D" | "T"; path: string }
export type KeepOutcome =
  | { ok: true }
  | { ok: false; reason: "conflict" | "unsaved" | "moved" | "error"; files: string[]; detail: string }

const chains = new Map<string, Promise<unknown>>()

/**
 * One landing operation per company folder at a time, from this process: two
 * Keeps racing would each see a clean tree and then fight over the index. The
 * control panel's other git writers are not in this chain; git's own
 * index.lock refuses the loser, and that reaches the user as a plain error.
 */
export function withRootLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const run = (chains.get(root) ?? Promise.resolve()).then(fn, fn)
  chains.set(
    root,
    run.catch(() => {})
  )
  return run
}

const output = (err: unknown) =>
  `${(err as { stdout?: string }).stdout ?? ""}\n${(err as { stderr?: string }).stderr ?? ""}`

/**
 * What the run's branch changed since the run began, file by file, for the
 * review card. The run's BRANCH, not the worktree's HEAD: Keep merges the
 * branch, so the card must show exactly that even if someone switched the
 * worktree elsewhere. quotePath off, so a name like `notas-reunión.md` reads
 * as written instead of as octal escapes (and still matches for its diff).
 */
export async function listRunChanges(
  run: { gitDir: string; baseSha: string; branch: string },
  exec: ExecFileFn
): Promise<RunChange[]> {
  const { stdout } = await exec("git", [
    "--git-dir",
    run.gitDir,
    "-c",
    "core.quotePath=false",
    "diff",
    "--name-status",
    "--no-renames",
    run.baseSha,
    run.branch,
  ])
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, file] = line.split("\t")
      return { status: status[0] as RunChange["status"], path: file }
    })
}

/**
 * What merging `branch` into the company's current branch would produce —
 * worked out by `merge-tree --write-tree` (git 2.38+), which writes no
 * working-tree files and no index entries: the merged tree, or the paths it
 * would conflict on.
 */
async function mergeTree(rootPath: string, branch: string, exec: ExecFileFn): Promise<{ tree: string; conflicts: string[] }> {
  try {
    const { stdout } = await exec("git", [
      "-C",
      rootPath,
      "-c",
      "core.quotePath=false",
      "merge-tree",
      "--write-tree",
      "--name-only",
      "--no-messages",
      "HEAD",
      branch,
    ])
    return { tree: stdout.trim().split("\n")[0], conflicts: [] }
  } catch (err) {
    // Exit 1 is "conflicts": the first line is a tree id, the rest are the paths.
    const lines = ((err as { stdout?: string }).stdout ?? "").split("\n").filter(Boolean)
    if (lines.length < 2) throw err
    return { tree: lines[0], conflicts: [...new Set(lines.slice(1))] }
  }
}

/** The files a merge of `branch` would conflict on; nothing is touched to find out. */
export async function conflictsWith(rootPath: string, branch: string, exec: ExecFileFn): Promise<string[]> {
  return (await mergeTree(rootPath, branch, exec)).conflicts
}

/**
 * Keep: put the run's branch into the company, or say exactly why not — and
 * never leave the company half-merged.
 *
 * The keep commit is BUILT before anything is touched: `merge-tree` gives the
 * merged tree and `commit-tree` makes the two-parent commit from it, so a
 * conflict, a signing failure or a missing identity all happen with the
 * company untouched. The company then fast-forwards to that commit, which is
 * all-or-nothing and never leaves MERGE_HEAD behind; git refuses it up front
 * when it would overwrite unsaved edits, and `--no-autostash` keeps a user's
 * merge.autostash from quietly stashing those edits instead. Hooks are off:
 * once kept, the folder holds files the agent wrote.
 *
 * Only into the branch the run started from (or one that has moved on from
 * it): anything else would carry in commits the review card never listed.
 */
export async function mergeRunBranch(
  rootPath: string,
  run: { branch: string; title: string; baseSha: string },
  exec: ExecFileFn
): Promise<KeepOutcome> {
  const git = (args: string[]) => exec("git", ["-C", rootPath, "-c", "core.hooksPath=/dev/null", ...args])
  try {
    try {
      await git(["symbolic-ref", "-q", "HEAD"])
    } catch {
      return { ok: false, reason: "moved", files: [], detail: "The company folder isn't on a branch right now." }
    }
    try {
      await git(["merge-base", "--is-ancestor", run.baseSha, "HEAD"])
    } catch {
      return {
        ok: false,
        reason: "moved",
        files: [],
        detail: "The company folder is on a different branch from the one this agent started from.",
      }
    }
    const { tree, conflicts } = await mergeTree(rootPath, run.branch, exec)
    if (conflicts.length > 0) return { ok: false, reason: "conflict", files: conflicts, detail: "" }
    const head = (await git(["rev-parse", "HEAD"])).stdout.trim()
    const commit = (
      await gitCommit(
        rootPath,
        ["commit-tree", tree, "-p", head, "-p", run.branch, "-m", `Keep agent run: ${run.title}`],
        exec
      )
    ).trim()
    await git(["merge", "--ff-only", "--no-autostash", commit])
    return { ok: true }
  } catch (err) {
    const text = output(err)
    const blocked = text.match(/would be overwritten by merge:\n([\s\S]*?)\n(?:Please|Aborting)/)
    if (blocked) {
      const files = blocked[1].split("\n").map((f) => f.trim()).filter(Boolean)
      return { ok: false, reason: "unsaved", files, detail: "" }
    }
    return { ok: false, reason: "error", files: [], detail: text.trim().split("\n")[0] ?? "" }
  }
}

/**
 * Files the agent made that git ignores (a company's `state/`, say — where
 * AGENTS.md sends generated output). They are never committed, so a keep
 * leaves them behind and a discard deletes them; the person deciding has to
 * be told, not find out.
 */
export async function listIgnoredFiles(run: { gitDir: string; worktreePath: string }, exec: ExecFileFn): Promise<string[]> {
  const { stdout } = await exec("git", [
    "--git-dir",
    run.gitDir,
    "--work-tree",
    run.worktreePath,
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.fsmonitor=false",
    "status",
    "--porcelain",
    "--ignored=matching",
    "--untracked-files=all",
  ])
  return stdout
    .split("\n")
    .filter((line) => line.startsWith("!! "))
    .map((line) => line.slice(3))
}
