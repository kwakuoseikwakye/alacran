import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { stat } from "node:fs/promises"
import path from "node:path"
import { registerCompanyImpl } from "../companies-registry"
import type { ExecFileFn } from "../git-commit-file"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

/**
 * A clone URL is a public Server Action parameter, so it is fully
 * attacker-controlled and must never reach `git clone` unvalidated: git treats
 * a leading `-` as a flag, and options like `--upload-pack=<cmd>` execute
 * arbitrary commands. Only accept the shapes a real GitHub remote takes.
 */
function isAcceptableCloneUrl(url: string): boolean {
  if (url.startsWith("-")) return false
  return /^https:\/\/[\w.-]+\/[\w.\-/]+$/.test(url) || /^git@[\w.-]+:[\w.\-/]+$/.test(url)
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/**
 * Bring a backed-up company onto this machine: clone it, then register it
 * through the SAME path as any other company — `registerCompanyImpl` enforces
 * the `.git` check, so a clone that reported success but produced nothing
 * usable is still rejected here. It deliberately does NOT verify the repo is
 * "really" an Alacrán company: the old `.claude` requirement claimed to and
 * didn't (a company need not have one), while blocking real repos.
 */
export async function restoreCompanyImpl(
  name: string,
  cloneUrl: string,
  targetPath: string,
  registryPath?: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = cloneUrl.trim()
  if (!isAcceptableCloneUrl(url)) {
    return { ok: false, message: "That doesn't look like a GitHub repository URL" }
  }
  // targetPath is just as attacker-controlled as the URL. A value like
  // "--upload-pack=<cmd>" would be read by git as an option, not a directory.
  // Requiring an absolute path both matches what a company path actually is
  // and rules out every leading-dash form.
  const target = targetPath.trim()
  if (!path.isAbsolute(target)) {
    return { ok: false, message: "Enter the full folder path, starting with /" }
  }
  if (await exists(target)) {
    return { ok: false, message: `${target} already exists — pick a different folder` }
  }

  try {
    // "--" terminates option parsing: belt-and-braces alongside the checks above
    await execFn("git", ["clone", "--", url, target])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `Clone failed: ${message}` }
  }

  const registered = registryPath
    ? await registerCompanyImpl(name, target, registryPath)
    : await registerCompanyImpl(name, target)
  if (!registered.ok) return registered
  return { ok: true }
}
