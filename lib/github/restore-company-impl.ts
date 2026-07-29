import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { stat } from "node:fs/promises"
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
 * through the SAME path as any other company — `registerCompanyImpl` already
 * enforces the `.git` + `.claude` membership checks, so a repo that isn't
 * actually an Alacrán company is rejected here too.
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
  if (await exists(targetPath)) {
    return { ok: false, message: `${targetPath} already exists — pick a different folder` }
  }

  try {
    await execFn("git", ["clone", url, targetPath])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: `Clone failed: ${message}` }
  }

  const registered = registryPath
    ? await registerCompanyImpl(name, targetPath, registryPath)
    : await registerCompanyImpl(name, targetPath)
  if (!registered.ok) return registered
  return { ok: true }
}
