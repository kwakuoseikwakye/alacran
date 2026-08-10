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
 * A GitHub SSH remote (`git@github.com:owner/repo.git`) rewritten to the
 * HTTPS form, or the URL unchanged if it's already HTTPS/not a github.com
 * URL at all (an enterprise host, say — left alone rather than guessed at).
 */
function toHttpsGithubUrl(url: string): string | null {
  const ssh = /^git@github\.com:(.+?)(?:\.git)?$/.exec(url)
  if (ssh) return `https://github.com/${ssh[1]}.git`
  return null
}

/**
 * Real user report: the repo gets created on GitHub, but the push right
 * after it fails with "make sure you have the correct access rights" —
 * even though `gh` is confirmed signed in (this button doesn't show unless
 * `githubStatus()` already verified that). Root cause: `gh`'s per-account
 * git protocol preference can be `ssh` (`gh auth status` shows this
 * independently of the global `gh config git_protocol` default), so
 * `gh repo create --remote=origin` wires up an SSH remote — and pushing
 * over SSH needs a working, unlocked SSH key completely separate from
 * whatever got `gh auth login` working. Sidestepped entirely: force the
 * remote to HTTPS and point git's HTTPS credential helper at `gh`'s own
 * already-verified token (`gh auth setup-git`, idempotent) — the same
 * credential this app already required before ever showing "Connected."
 */
async function ensurePushableRemote(execFn: ExecFileFn, root: string, remoteUrl: string | null): Promise<void> {
  if (remoteUrl) {
    const httpsUrl = toHttpsGithubUrl(remoteUrl)
    if (httpsUrl) {
      await execFn("git", ["-C", root, "remote", "set-url", "origin", httpsUrl]).catch(() => {})
    }
  }
  // Host-wide, not per-repo — always worth doing, even if the URL couldn't
  // be read back for some reason.
  await execFn("gh", ["auth", "setup-git"]).catch(() => {})
}

// GitHub's real wording for "an OAuth-token push would create/update a
// .github/workflows/* file, and this token has no `workflow` scope" — the
// scope gh's own default `gh auth login` doesn't request.
const WORKFLOW_SCOPE_PATTERN = /workflow.*scope|refusing to allow an oauth app/i

/**
 * Real user report: repo created fine, but the push right after it failed
 * with "refusing to allow an OAuth App to create or update workflow
 * `.github/workflows/verify.yml` without `workflow` scope." This app's own
 * company-starter template used to ship exactly such a file (fixed in
 * v55's manifest — see CHANGELOG.md) — every company created before that
 * fix already has it committed, so their push keeps failing regardless.
 * Rather than making the user re-authenticate `gh` with a wider scope just
 * to unblock a backup, untrack it: it's a CI wrapper with no value in a
 * solo, unreviewed repo (`scripts/verify.py` / `/verify` already run it
 * directly, no CI needed) and retry once. A push that fails for any other
 * reason still surfaces as-is.
 */
async function pushSelfHealingWorkflowScope(execFn: ExecFileFn, root: string): Promise<void> {
  try {
    await execFn("git", ["-C", root, "push", "-u", "origin", "HEAD"])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!WORKFLOW_SCOPE_PATTERN.test(message)) throw error
    await execFn("git", ["-C", root, "rm", "-r", "--cached", ".github/workflows"])
    await execFn("git", [
      "-C",
      root,
      "commit",
      "-m",
      "Remove .github/workflows — needs gh's workflow OAuth scope to push, and isn't needed (scripts/verify.py runs it directly)",
    ])
    await execFn("git", ["-C", root, "push", "-u", "origin", "HEAD"])
  }
}

/**
 * Make this company recoverable on another machine.
 *
 * First backup, or an `origin` left over from before the GitHub repo behind
 * it ever existed (a remote added by hand, or a registered directory that
 * came with one): `gh repo create` creates the repo and wires up `origin`.
 * ALWAYS `--private` — a company repo carries real business context
 * (ontology, decisions, notes), so a public default would be a privacy
 * incident, not a preference. The push itself is always done explicitly
 * afterward (not via `gh repo create --push`), so `ensurePushableRemote`
 * gets a chance to fix the remote's protocol first.
 *
 * Subsequent backups against a remote that already works: just push.
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
      await ensurePushableRemote(execFn, root, existing.remoteUrl)
      await pushSelfHealingWorkflowScope(execFn, root)
      const after = await getCompanyRemoteImpl(agentId, execFn)
      return { ok: true, remoteUrl: after.ok ? after.remoteUrl : existing.remoteUrl }
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
    await execFn("gh", ["repo", "create", repoName, "--private", "--source=" + root, "--remote=origin"])

    const created = await getCompanyRemoteImpl(agentId, execFn)
    await ensurePushableRemote(execFn, root, created.ok ? created.remoteUrl : null)
    await pushSelfHealingWorkflowScope(execFn, root)

    const after = await getCompanyRemoteImpl(agentId, execFn)
    return { ok: true, remoteUrl: after.ok ? after.remoteUrl : null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message }
  }
}
