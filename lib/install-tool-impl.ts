import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { clearExecMemo } from "./exec-memo"
import { isClaudeCodeCli } from "./is-claude-code-cli"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  // execFile, not spawn: for a missing binary execFile rejects, where spawn
  // fires an 'error' event that takes the server down if nobody listens —
  // the exact bug v56 fixed at five call sites. 10 minutes is generous for a
  // cold Homebrew install on a slow connection.
  return execFileAsync(command, args, { timeout: 10 * 60_000, maxBuffer: 4 * 1024 * 1024 })
}

export type InstallableId = "claude-code" | "gh" | "gog" | "google-antigravity"

export type InstallResult = {
  ok: boolean
  /** Combined stdout+stderr, shown verbatim so a stuck user can paste it. */
  log: string
  /** Set when there's no verified command for this tool on this platform.
   *  The UI turns this into "Let the AI install it" rather than an error. */
  needsAgent?: boolean
}

/**
 * The one verified install command per tool, or none.
 *
 * Deliberately at most ONE command each. An earlier draft had ordered
 * fallback chains (brew, then scrape the GitHub releases API, then extract a
 * tarball) — that's a fragile shell script I can't test on a machine that
 * already has Homebrew, to handle a case the repair agent (0.5) handles
 * better anyway. If the one verified command is missing or fails, that's the
 * agent's job.
 *
 * Every string here is a fixed literal. Nothing user-supplied is ever spliced
 * into these, which is what makes `bash -lc` acceptable at all.
 */
const COMMANDS: Record<InstallableId, (platform: NodeJS.Platform) => string | undefined> = {
  // Verified 2026-08-14: https://claude.ai/install.sh 302s to
  // downloads.claude.ai/claude-code-releases/bootstrap.sh and installs the
  // NATIVE build, so it needs no Node of its own. Lands in ~/.local/bin,
  // which scripts/package-macos.sh already has on PATH — so no relaunch.
  "claude-code": () => "curl -fsSL https://claude.ai/install.sh | bash",
  // Homebrew only. Not because Linux can't have gh, but because gh's own docs
  // discourage the snap and the apt route is multi-step — the same reason
  // connect-status-impl doesn't print a Linux command either.
  gh: (platform) => (platform === "darwin" ? "brew install gh" : undefined),
  // gogcli landed in homebrew-core (v48), so no tap is needed.
  gog: (platform) => (platform === "darwin" ? "brew install gogcli" : undefined),
  // No entry on purpose. Antigravity CLI ships as a ~170MB native binary and
  // this project has never verified its canonical installer URL against the
  // real thing. v64's standing rule is that an unverified third-party command
  // must not go on screen as the thing that completes a step — so this one
  // goes to the agent, which can look it up, instead of to a guess.
  "google-antigravity": () => undefined,
}

/** Read the tool back from the OS, never trust the installer's exit code.
 *  Same discipline as v31's checkLaunchdJob: `launchctl` was measured exiting
 *  0 while failing, and a package manager that "succeeds" without putting a
 *  binary on PATH is the same lie in a different shape. */
async function isInstalled(execFn: ExecFileFn, id: InstallableId): Promise<boolean> {
  if (id === "claude-code") return isClaudeCodeCli(execFn)
  const binary = id === "gh" ? "gh" : id === "gog" ? "gog" : "agy"
  try {
    await execFn("which", [binary])
    return true
  } catch {
    return false
  }
}

export async function installToolImpl(
  id: InstallableId,
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform
): Promise<InstallResult> {
  const command = COMMANDS[id](platform)
  if (!command) return { ok: false, needsAgent: true, log: "" }

  let log = `$ ${command}\n`
  try {
    const { stdout, stderr } = await execFn("bash", ["-lc", command])
    log += stdout + stderr
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    log += (e.stdout ?? "") + (e.stderr ?? "") + (e.message ?? "")
    // Fall through: the command may have failed AND installed (a Homebrew
    // post-install warning exits non-zero), so the real answer is the probe.
  }

  // The memo (v70) cached "not installed" for up to 5 minutes; a fresh install
  // is exactly the event that must invalidate it, or the card keeps lying.
  clearExecMemo()
  const ok = await isInstalled(execFn, id)
  return { ok, log, needsAgent: ok ? undefined : true }
}
