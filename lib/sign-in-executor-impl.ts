import { defaultExecFile } from "./default-exec-file"
import { spawn as defaultSpawn, type ChildProcess } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { buildInteractiveTerminalScript } from "./company-commands/build-visible-run-script"
import { resolveTerminalLaunchCommand, launchTerminalScript, type ExecFileFn } from "./terminal-launch-command"
import { DATA_DIR } from "./data-dir"
import { getAiExecutor } from "./ai-executors"

export type SpawnFn = (command: string, args: string[], opts: Record<string, unknown>) => ChildProcess
export type SignInResult = { started: boolean; message: string }

/**
 * A CLI sign-in needs a real terminal — it prints a URL, opens the browser and
 * waits for the user to come back. That makes it the one remaining justified
 * terminal in the non-technical path: once, ever, for an OAuth flow that
 * genuinely cannot happen anywhere else. True of `claude auth login` and of
 * `kiro-cli login --license free` alike.
 *
 * The email is optional and only pre-populates Claude Code's login page
 * (`--email <addr>`, confirmed against the real CLI's own help). Getting it
 * wrong costs nothing — the browser flow still lets the user pick — but
 * getting it RIGHT is what makes the Google setup later line up on the same
 * account, so the UI asks for it. Kiro has no equivalent and ignores it, which
 * is why `signInAcceptsEmail` gates whether the field is shown at all.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 254) return false
  // A NUL byte would truncate the generated script at the write, and control
  // characters have no business in an address — v35 found exactly this shape
  // as a real argv-injection path into a spawned `claude`. shQuote handles
  // shell metacharacters; this handles what quoting can't.
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return false
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(trimmed)
}

export async function signInExecutorImpl(
  executorId: string,
  email: string,
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform,
  dataDir: string = DATA_DIR,
  home: string = homedir()
): Promise<SignInResult> {
  const trimmed = email.trim()
  if (trimmed && !isPlausibleEmail(trimmed)) {
    return { started: false, message: "That doesn't look like an email address." }
  }

  // getAiExecutor falls back to the default for an unknown id, so this cannot
  // be steered into spawning an arbitrary binary from a public Server Action.
  const executor = getAiExecutor(executorId)
  const args = executor.buildSignInArgs?.(executor.signInAcceptsEmail && trimmed ? trimmed : undefined)
  if (!args) {
    // Absence is a supported state, not an error to paper over: rendering a
    // button anyway is how the Kiro card ended up briefly wired to
    // `claude auth login`.
    return { started: false, message: `${executor.label} has no sign-in command this app can run for you.` }
  }
  const manual = [executor.binaryName, ...args].join(" ")

  const launch = await resolveTerminalLaunchCommand(platform, execFn)
  if (!launch) {
    return {
      started: false,
      message: `No supported terminal found on this machine. Run "${manual}" yourself.`,
    }
  }

  // Reuses the exact script builder v38/v46 already use: cd somewhere, exec
  // the binary with args. Home is the cwd because signing in isn't scoped to
  // any company — it's machine-wide, like the gog and gh credential stores.
  const script = buildInteractiveTerminalScript({ binaryName: executor.binaryName, cwd: home, introArgs: args })
  const scriptPath = path.join(dataDir, `${executor.id}-sign-in.sh`)
  // DATA_DIR is created lazily by whichever feature writes first. On a fresh
  // install nothing has, so this must not assume it exists — the failure is an
  // ENOENT reported to the user as "couldn't open a terminal", on the exact
  // path this whole slice exists to make work.
  await mkdir(dataDir, { recursive: true })
  await writeFile(scriptPath, script, { mode: 0o755 })

  const outcome = await launchTerminalScript(launch, scriptPath, home, spawnFn)
  if (!outcome.opened) {
    return {
      started: false,
      message: `Couldn't open a terminal — ${outcome.reason}. Run "${manual}" yourself.`,
    }
  }

  return { started: true, message: "Opened Terminal — finish signing in there, then press Re-check." }
}
