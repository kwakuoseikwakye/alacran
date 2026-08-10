import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { getEffectiveAgents } from "../get-effective-agents"
import type { ExecFileFn } from "../git-commit-file"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type RemoteResult = { ok: true; remoteUrl: string | null } | { ok: false; message: string }
export type BackupResult = { ok: true; remoteUrl: string | null } | { ok: false; message: string }

async function resolveRoot(agentId: string): Promise<{ ok: true; root: string; name: string } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }
  return { ok: true, root: agent.rootPath, name: agent.name }
}

/** Read `origin`'s URL, or null when the company has never been backed up. */
export async function getCompanyRemoteImpl(
  agentId: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<RemoteResult> {
  const resolved = await resolveRoot(agentId)
  if (!resolved.ok) return resolved

  try {
    const { stdout } = await execFn("git", ["-C", resolved.root, "remote", "get-url", "origin"])
    const url = stdout.trim()
    return { ok: true, remoteUrl: url || null }
  } catch {
    // git exits non-zero when the remote simply doesn't exist — not an error
    return { ok: true, remoteUrl: null }
  }
}

// git's own wording for "this remote's repo was never created (or you don't
// have access)" — both the HTTPS ("... not found") and SSH ("Please make
// sure you have the correct access rights") forms. Only THIS failure gets
// the self-heal below; a network blip or an expired token must still
// surface as a real error instead of silently spawning a second repo.
const MISSING_REPO_PATTERN = /not found|correct access rights/i

/**
 * Make this company recoverable on another machine.
 *
 * First backup, or an `origin` left over from before the GitHub repo behind
 * it ever existed (a remote added by hand, or a registered directory that
 * came with one): `gh repo create` with `--source`/`--push` does create +
 * wire up `origin` + push in one step. ALWAYS `--private` — a company repo
 * carries real business context (ontology, decisions, notes), so a public
 * default would be a privacy incident, not a preference.
 *
 * Subsequent backups against a remote that actually works: just push.
 */
export async function backupCompanyImpl(
  agentId: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<BackupResult> {
  const resolved = await resolveRoot(agentId)
  if (!resolved.ok) return resolved
  const { root, name } = resolved

  const existing = await getCompanyRemoteImpl(agentId, execFn)
  if (!existing.ok) return existing

  if (existing.remoteUrl) {
    try {
      await execFn("git", ["-C", root, "push", "-u", "origin", "HEAD"])
      return { ok: true, remoteUrl: existing.remoteUrl }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!MISSING_REPO_PATTERN.test(message)) return { ok: false, message }
      // Stale remote — clear it and fall through to create-and-push below,
      // same as a company that's never been backed up at all.
      await execFn("git", ["-C", root, "remote", "remove", "origin"]).catch(() => {})
    }
  }

  try {
    // Repo name from the company name: GitHub only accepts [A-Za-z0-9._-]
    const repoName = name.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "company"
    await execFn("gh", ["repo", "create", repoName, "--private", "--source=" + root, "--remote=origin", "--push"])

    const after = await getCompanyRemoteImpl(agentId, execFn)
    return { ok: true, remoteUrl: after.ok ? after.remoteUrl : null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message }
  }
}
