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

export type InstallableId = "claude-code" | "gh" | "gog" | "kiro" | "beeper" | "codex"

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
  // which is on PATH via scripts/package-linux.sh's COMMON_BINS on Linux,
  // and the macOS shell's electron/main.js resolveWidePath() on mac —
  // so no relaunch.
  "claude-code": () => "curl -fsSL https://claude.ai/install.sh | bash",
  // npm, because that is how the installed 0.147.0 on this machine got here
  // (resolved to .../lib/node_modules/@openai/codex/bin/codex.js) and the app
  // already bundles node. No brew: its installer prompts for a password.
  codex: () => "npm install -g @openai/codex",
  // Homebrew only. Not because Linux can't have gh, but because gh's own docs
  // discourage the snap and the apt route is multi-step — the same reason
  // connect-status-impl doesn't print a Linux command either.
  gh: (platform) => (platform === "darwin" ? "brew install gh" : undefined),
  // gogcli landed in homebrew-core (v48), so no tap is needed.
  gog: (platform) => (platform === "darwin" ? "brew install gogcli" : undefined),
  // No platform guard, unlike gh/gog: Kiro's own installer handles macOS (a
  // DMG whose app bundle goes to /Applications and then writes symlinks into
  // ~/.local/bin) and Linux (a binary straight into ~/.local/bin). Verified
  // 2026-08-25 by reading the script and running it — 2.19.1 landed and
  // `which kiro-cli` succeeded, with no prompt, on a machine that had none.
  //
  // It is NOT idempotent, and that is the one thing to know before touching
  // this line: with the app already in /Applications the script asks "replace
  // it?" by reading /dev/tty, which `--force` does NOT suppress, so under
  // `bash -lc` it dies with "Device not configured" and cleans up. That path
  // is reachable — app present but symlinks gone reads as "not found" and
  // offers this button. It is left to fail rather than worked around: the
  // stderr says exactly what happened, which is precisely the input v71's 0.5
  // repair fallback ("Let the AI fix it") is designed to receive. Do not add a
  // pty shim or a hand-rolled relink here; `open -g -a` and
  // `kiro-cli setup --no-confirm --global` were both measured and neither
  // restores the symlinks.
  kiro: () => "curl -fsSL https://cli.kiro.dev/install | bash",
  // npm, not the Homebrew tap the README recommends first — `brew install
  // beeper/tap/cli` is TWO commands on a machine that hasn't tapped
  // (`brew tap beeper/tap` first; measured, brew refuses with "This command
  // requires the tap beeper/tap"), and this file ships one command per tool.
  // The npm route is one command AND cross-platform, which is why beeper has
  // no `platform === "darwin"` guard where gh and gog do. The package is
  // `beeper-cli`, the installed binary is `beeper`.
  //
  // Verified 2026-08-31 with `npm install -g beeper-cli --dry-run`: resolves
  // to 0.6.2, one package, no build step. Not run for real here — if the
  // global prefix isn't writable this fails loudly and that stderr is exactly
  // what v71's 0.5 repair fallback is for.
  beeper: () => "npm install -g beeper-cli",
}

/** One binary per installable, so a new id is a compile error here rather than
 *  a ternary that silently keeps answering for the wrong tool. */
const BINARIES: Record<InstallableId, string> = {
  "claude-code": "claude",
  codex: "codex",
  gh: "gh",
  gog: "gog",
  kiro: "kiro-cli",
  beeper: "beeper",
}

/** Read the tool back from the OS, never trust the installer's exit code.
 *  Same discipline as v31's checkLaunchdJob: `launchctl` was measured exiting
 *  0 while failing, and a package manager that "succeeds" without putting a
 *  binary on PATH is the same lie in a different shape. */
async function isInstalled(execFn: ExecFileFn, id: InstallableId): Promise<boolean> {
  if (id === "claude-code") return isClaudeCodeCli(execFn)
  try {
    await execFn("which", [BINARIES[id]])
    return true
  } catch {
    return false
  }
}

/** Public boundary: `id` arrives from a client, so it is checked against the
 *  real key set rather than trusted to be in the union. Indexing COMMANDS with
 *  an unknown id throws a TypeError, which fails open-ish (a 500) instead of
 *  failing closed. */
export function isInstallableId(value: unknown): value is InstallableId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(COMMANDS, value)
}

export async function installToolImpl(
  id: InstallableId,
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform
): Promise<InstallResult> {
  if (!isInstallableId(id)) return { ok: false, log: "", needsAgent: false }
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
