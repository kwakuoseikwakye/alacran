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
 * What the user has to do, in the only terms that actually resolve this.
 *
 * An earlier version of this file tried to self-heal instead, by untracking
 * `.github/workflows` at the tip and retrying the push. That cannot work on
 * the case it was written for. The failure's home turf is a company's
 * FIRST-ever backup, where the push carries the entire history — including
 * the commit that added the workflow file. GitHub's check is on what the
 * push introduces, not on what the final tree happens to contain, so a new
 * tip commit deleting the file leaves the offending commit right where it
 * was: the retry gets rejected identically, and the user is left with a junk
 * commit AND the original error. (It also can't help a later push: if a new
 * commit touches a workflow, that commit is still in the range.)
 *
 * Widening the token is the only fix that doesn't involve rewriting the
 * user's history, so this asks for it plainly instead of guessing.
 */
const WORKFLOW_SCOPE_HELP =
  "This company's git history includes a GitHub Actions workflow (a file under .github/workflows/), and " +
  "GitHub refuses any push containing one unless the GitHub CLI's sign-in includes the “workflow” permission — " +
  "which `gh auth login` doesn't ask for by default.\n\n" +
  "Run this once in a terminal, then click Back up again:\n\n" +
  "    gh auth refresh -s workflow"

/** Whether gh's own token carries the `workflow` scope. */
async function hasWorkflowScope(execFn: ExecFileFn): Promise<boolean> {
  let text: string
  try {
    // gh prints this block to stdout on current versions and to stderr on
    // older ones; read both rather than depending on which.
    const { stdout, stderr } = await execFn("gh", ["auth", "status"])
    text = `${stdout}\n${stderr}`
  } catch {
    // Can't read the scopes — don't invent a blocking error out of it. The
    // push itself is still gated by the real check on GitHub's side, and
    // WORKFLOW_SCOPE_PATTERN below turns that into the same guidance.
    return true
  }
  const scopes = /token scopes:(.*)/i.exec(text)
  return scopes !== null && /'workflow'/i.test(scopes[1])
}

/** Whether anything under .github/workflows/ appears anywhere in this repo's
 *  history — not just at the tip, because the push carries the commits. */
async function historyContainsWorkflows(execFn: ExecFileFn, root: string): Promise<boolean> {
  try {
    const { stdout } = await execFn("git", [
      "-C",
      root,
      "log",
      "--all",
      "--max-count=1",
      "--format=%H",
      "--",
      ".github/workflows",
    ])
    return stdout.trim() !== ""
  } catch {
    return false
  }
}

/**
 * Push, but refuse up front when the token provably can't carry this repo's
 * history, so the user gets the one instruction that fixes it instead of
 * git's raw rejection — and nothing is committed or rewritten on their behalf.
 */
async function pushWithWorkflowScopeCheck(execFn: ExecFileFn, root: string): Promise<void> {
  if ((await historyContainsWorkflows(execFn, root)) && !(await hasWorkflowScope(execFn))) {
    throw new Error(WORKFLOW_SCOPE_HELP)
  }
  try {
    await execFn("git", ["-C", root, "push", "-u", "origin", "HEAD"])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Backstop for whatever the pre-check couldn't see (a second gh account,
    // a token changed mid-flight, an enterprise host): same guidance, still
    // no junk commit.
    if (WORKFLOW_SCOPE_PATTERN.test(message)) throw new Error(WORKFLOW_SCOPE_HELP)
    throw error
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
      await pushWithWorkflowScopeCheck(execFn, root)
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
    await pushWithWorkflowScopeCheck(execFn, root)

    const after = await getCompanyRemoteImpl(agentId, execFn)
    return { ok: true, remoteUrl: after.ok ? after.remoteUrl : null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message }
  }
}
