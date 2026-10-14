import fs from "node:fs/promises"
import path from "node:path"
import type { ExecFileFn } from "@/lib/git-commit-file"

export { withFileLock } from "@/lib/os/records/write"

async function realOrAncestor(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err

    // realpath failed with ENOENT. Check if path exists as a dangling symlink.
    let pathExists = false
    try {
      await fs.lstat(p)
      pathExists = true
    } catch (lstatErr) {
      const code = (lstatErr as NodeJS.ErrnoException).code
      if (code !== "ENOENT") throw lstatErr
      // lstat also gave ENOENT, path truly doesn't exist
    }

    if (pathExists) {
      // Path exists (as symlink or other) but realpath failed: dangling symlink
      throw err
    }

    // Path doesn't exist, safe to climb to parent
    const parent = path.dirname(p)
    if (parent === p) throw err
    return path.join(await realOrAncestor(parent), path.basename(p))
  }
}

/** True when `target` (which may not exist yet) really lives inside `root`, following symlinks. */
export async function contained(root: string, target: string): Promise<boolean> {
  // Reject raw target strings containing .. path segments
  const parts = target.split(/[\/\\]/)
  if (parts.includes("..")) return false

  try {
    const base = await fs.realpath(root)
    const real = await realOrAncestor(path.resolve(target))
    return real === base || real.startsWith(base + path.sep)
  } catch {
    return false
  }
}

/**
 * Uncommitted changes under these paths. Empty when there are none or git can't say.
 * Pages call this on every render, and the auto-refresh re-renders every 15 seconds. `--no-optional-locks` (a global
 * option, so it precedes `status`) stops git from refreshing stale stat data into `.git/index`, which takes
 * `index.lock` and can fail an agent's `git add`/`git commit` in the same repo.
 */
export async function dirtyPaths(root: string, paths: string[], exec: ExecFileFn): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["--no-optional-locks", "-C", root, "status", "--porcelain", "--untracked-files=all", "--", ...paths])
    return stdout.split("\n").filter(Boolean)
  } catch {
    return []
  }
}

export async function trackedUnder(root: string, rel: string, exec: ExecFileFn): Promise<boolean> {
  try {
    const { stdout } = await exec("git", ["-C", root, "ls-files", "--", rel])
    return stdout.trim().length > 0
  } catch {
    return false
  }
}
