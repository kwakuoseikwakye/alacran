import { spawn as defaultSpawn, execFile as nodeExecFile, type ChildProcess } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { buildInteractiveTerminalScript } from "./company-commands/build-visible-run-script"
import { resolveTerminalLaunchCommand, type ExecFileFn } from "./terminal-launch-command"
import { DATA_DIR } from "./data-dir"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type SpawnFn = (command: string, args: string[], opts: Record<string, unknown>) => ChildProcess
export type SignInResult = { started: boolean; message: string }

/**
 * `claude auth login` needs a real terminal — it prints a URL, opens the
 * browser and waits for the user to come back. That makes it the one
 * remaining justified terminal in the non-technical path: once, ever, for an
 * OAuth flow that genuinely cannot happen anywhere else.
 *
 * The email is optional and only pre-populates the login page
 * (`--email <addr>`, confirmed against the real CLI's own help). Getting it
 * wrong costs nothing — the browser flow still lets the user pick — but
 * getting it RIGHT is what makes the Google setup later line up on the same
 * account, so the UI asks for it.
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

export async function signInClaudeImpl(
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

  const launch = await resolveTerminalLaunchCommand(platform, execFn)
  if (!launch) {
    return {
      started: false,
      message: `No supported terminal found on this machine. Run "claude auth login" yourself.`,
    }
  }

  // Reuses the exact script builder v38/v46 already use: cd somewhere, exec
  // the binary with args. Home is the cwd because signing in isn't scoped to
  // any company — it's machine-wide, like the gog and gh credential stores.
  const args = trimmed ? ["auth", "login", "--email", trimmed] : ["auth", "login"]
  const script = buildInteractiveTerminalScript({ binaryName: "claude", cwd: home, introArgs: args })
  const scriptPath = path.join(dataDir, "claude-sign-in.sh")
  // DATA_DIR is created lazily by whichever feature writes first. On a fresh
  // install nothing has, so this must not assume it exists — the failure is an
  // ENOENT reported to the user as "couldn't open a terminal", on the exact
  // path this whole slice exists to make work.
  await mkdir(dataDir, { recursive: true })
  await writeFile(scriptPath, script, { mode: 0o755 })

  const child = spawnFn(launch.command, launch.args(scriptPath), {
    cwd: home,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  })
  // v56: a launcher that can't start fires 'error' with no 'exit', and an
  // unhandled 'error' event takes the server down.
  child.on("error", () => {})
  child.unref()

  return { started: true, message: "Opened Terminal — finish signing in there, then press Re-check." }
}
