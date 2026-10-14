import { defaultExecFile } from "./default-exec-file"

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

/**
 * The identity to commit as when the machine hasn't got one of its own.
 *
 * git refuses to commit at all without an author, and a fresh Linux install
 * has no `user.name`/`user.email`: git tries to build one from the OS user and
 * hostname, gets something like `parallels@ubuntu-linux-2404.(none)`, decides
 * it isn't a real address and gives up. Reported from a real Ubuntu
 * onboarding as "Failed to scaffold company: ... Author identity unknown",
 * which stopped the user at the first thing this app asks them to do.
 *
 * ponytail: an app-owned identity, not the user's. Ceiling: their own name
 * isn't on these commits, so a later GitHub push shows an unrecognised author.
 * Putting their name on it means asking for one in onboarding and writing it
 * to the repo's config — a feature, not a crash fix. Do that when someone
 * actually asks whose name is on the commit.
 */
export const FALLBACK_COMMIT_NAME = "Alacrán"
export const FALLBACK_COMMIT_EMAIL = "alacran@localhost"

/**
 * Run a git commit, and if it fails *because this machine has no identity*,
 * run it once more as the fallback author.
 *
 * Reactive rather than pre-flight on purpose. Checking `git var
 * GIT_AUTHOR_IDENT` before every commit would be one extra process spawn on
 * every approved diff, forever, to catch a condition almost no machine is in
 * — the same "what does this cost when it runs 50 times an hour" question v70
 * asked of the Keychain probes. Failing first costs nothing on a machine that
 * works, and the retry only happens on one that doesn't.
 *
 * The identity is confirmed with git's own `git var GIT_AUTHOR_IDENT` (which
 * respects repo-local config as well as global, so a repo the user configured
 * by hand still wins) rather than by matching git's error text, which is not
 * stable across versions or locales. Any other commit failure — nothing
 * staged, a rejecting hook — rethrows the ORIGINAL error, so callers that
 * already treat "nothing to commit" as benign keep seeing what they expect.
 */
/** Resolves to git's stdout — `commit-tree` prints the commit it made, and a
 *  caller that builds a commit without touching the working tree needs it. */
export async function gitCommit(repoRoot: string, commitArgs: string[], execFn: ExecFileFn): Promise<string> {
  try {
    return (await execFn("git", ["-C", repoRoot, ...commitArgs])).stdout
  } catch (err) {
    try {
      await execFn("git", ["-C", repoRoot, "var", "GIT_AUTHOR_IDENT"])
    } catch {
      // No usable identity: this is the failure this function exists for.
      const retried = await execFn("git", [
        "-C",
        repoRoot,
        "-c",
        `user.name=${FALLBACK_COMMIT_NAME}`,
        "-c",
        `user.email=${FALLBACK_COMMIT_EMAIL}`,
        ...commitArgs,
      ])
      return retried.stdout
    }
    throw err
  }
}

export async function commitFile(
  repoRoot: string,
  // Several paths, one commit — still pathspec-scoped, so nothing outside them
  // can be swept in. Callers that pass one path are unaffected.
  relativePath: string | string[],
  message: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<void> {
  const paths = Array.isArray(relativePath) ? relativePath : [relativePath]
  await execFn("git", ["-C", repoRoot, "add", "--", ...paths])
  await gitCommit(repoRoot, ["commit", "-m", message, "--", ...paths], execFn)
}

export async function gitCommitFile(options: {
  rootPath: string
  filePaths: string[]
  commitMessage: string
  execFn?: ExecFileFn
}): Promise<void> {
  return commitFile(options.rootPath, options.filePaths, options.commitMessage, options.execFn)
}

