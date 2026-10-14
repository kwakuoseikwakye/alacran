import { defaultExecFile } from "@/lib/default-exec-file"
import type { ExecFileFn } from "@/lib/git-commit-file"
import { PROFILE_PATH } from "./checks"

const REC = "\x1e"
const FLD = "\x1f"
export const THRESHOLDS_PATH = "definitions/memory-health.yaml"

/**
 * The five read-only git calls, relative to the company root. `--no-optional-locks`: a git
 * call made while rendering must not take index.lock. Every read is of HEAD, never the working tree.
 */
export function gitReader(rootPath: string, execFn: ExecFileFn = defaultExecFile) {
  const git = async (args: string[]) => (await execFn("git", ["-C", rootPath, "--no-optional-locks", "-c", "core.quotepath=false", ...args])).stdout

  async function showIfPresent(rel: string): Promise<string | null> {
    const listed = await git(["ls-tree", "--name-only", "HEAD", "--", rel])
    return listed.trim() ? git(["show", `HEAD:./${rel}`]) : null
  }

  return {
    /** null: no commits yet, or no company profile at HEAD. Throws when git cannot be read at all. */
    async profileText(): Promise<string | null> {
      try {
        await git(["rev-parse", "--verify", "-q", "HEAD"])
      } catch (e) {
        if ((e as { code?: number }).code !== 1) throw e // only exit 1 means an unborn HEAD
        await git(["rev-parse", "--git-dir"]) // throws if this is not a repo; otherwise: a repo with no commits yet
        return null
      }
      return showIfPresent(PROFILE_PATH)
    },
    blame: () => git(["blame", "--line-porcelain", "HEAD", "--", PROFILE_PATH]),
    sourcesLog: () => git(["log", "-n500", `--format=${REC}%H${FLD}%s${FLD}%B${FLD}`, "--patch", "-U0", "--no-ext-diff", "--", PROFILE_PATH]),
    async todoGrep(): Promise<string> {
      try {
        return await git(["grep", "-n", "-F", "<<TODO", "HEAD", "--", "definitions", ":(exclude,glob,icase)**/README.md"])
      } catch (e) {
        if ((e as { code?: number }).code === 1) return "" // git grep exits 1 for "no match"
        throw e
      }
    },
    async thresholdsText(): Promise<string | null> {
      try {
        return await showIfPresent(THRESHOLDS_PATH)
      } catch {
        return null // an unreadable thresholds file never blocks the check
      }
    },
  }
}
