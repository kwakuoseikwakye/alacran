import { mkdir } from "node:fs/promises"
import path from "node:path"
import { gitCommit, type ExecFileFn } from "../git-commit-file"

/** Whether the company folder has edits nobody has committed — which an agent,
 *  starting from the last commit, will not see. */
export async function hasUnsavedChanges(rootPath: string, exec: ExecFileFn): Promise<boolean> {
  const { stdout } = await exec("git", ["-C", rootPath, "status", "--porcelain"])
  return stdout.trim().length > 0
}

/**
 * The agent's own copy of the company, on its own branch, from the last commit.
 *
 * Returns what later commits must use, read NOW, before the agent starts:
 * where git keeps this worktree (its `.git` file lives inside the worktree, so
 * the agent can rewrite it) and the commit the run began from (so the file count
 * is what the whole branch changed, not only the last commit).
 */
export async function createRunWorktree(
  rootPath: string,
  branch: string,
  worktreePath: string,
  exec: ExecFileFn
): Promise<{ gitDir: string; baseSha: string }> {
  await mkdir(path.dirname(worktreePath), { recursive: true })
  const baseSha = (await exec("git", ["-C", rootPath, "rev-parse", "HEAD"])).stdout.trim()
  await exec("git", ["-C", rootPath, "worktree", "add", "-q", "-b", branch, worktreePath, baseSha])
  const gitDir = (await exec("git", ["-C", worktreePath, "rev-parse", "--absolute-git-dir"])).stdout.trim()
  return { gitDir, baseSha }
}

/**
 * git aimed at the run's repository by the path recorded at start — never by the
 * worktree's `.git` file — with every repo-configured command switched off.
 * Hooks (a relative `core.hooksPath` resolves INSIDE the worktree) and
 * fsmonitor would otherwise run as the user from files the agent could have
 * written: the agent has no Bash, and this is the path that would hand it one.
 */
const runGit = (gitDir: string, worktreePath: string) => [
  "--git-dir",
  gitDir,
  "--work-tree",
  worktreePath,
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
]

/** Whether the run's copy holds edits not yet committed on its branch
 *  (ignored files excluded — those are reported separately). */
export async function worktreeHasChanges(worktreePath: string, gitDir: string, exec: ExecFileFn): Promise<boolean> {
  const { stdout } = await exec("git", [...runGit(gitDir, worktreePath), "status", "--porcelain"])
  return stdout.trim().length > 0
}

/**
 * Commit everything the agent changed, on its branch. Returns how many files
 * the branch has changed since the run began.
 *
 * `add -A` is right HERE and nowhere else in this app (the single-file commit
 * rule in AGENTS.md is about a user's working folder): this worktree exists
 * only for this run, so everything in it that changed, the run changed. The
 * agent itself has no Bash and cannot commit, so the app does it on exit.
 */
export async function commitRunWorktree(
  worktreePath: string,
  gitDir: string,
  baseSha: string,
  title: string,
  exec: ExecFileFn
): Promise<number> {
  const git = runGit(gitDir, worktreePath)
  await exec("git", [...git, "add", "-A"])
  const staged = (await exec("git", [...git, "diff", "--cached", "--name-only"])).stdout.trim()
  if (staged) await gitCommit(worktreePath, [...git, "commit", "-q", "--no-verify", "-m", `Agent: ${title}`], exec)
  const changed = (await exec("git", [...git, "diff", "--name-only", baseSha, "HEAD"])).stdout
  return changed.split("\n").filter(Boolean).length
}

/**
 * Remove a run's worktree and branch. Best-effort. Hooks off: after a Keep the
 * company folder holds files the agent wrote, and `branch -D` fires the
 * reference-transaction hook from a relative core.hooksPath inside it.
 */
export async function removeRunWorktree(rootPath: string, worktreePath: string, branch: string, exec: ExecFileFn) {
  const git = ["-C", rootPath, "-c", "core.hooksPath=/dev/null"]
  await exec("git", [...git, "worktree", "remove", "--force", worktreePath]).catch(() => {})
  await exec("git", [...git, "branch", "-D", branch]).catch(() => {})
}
