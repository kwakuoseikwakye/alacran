import { execFile } from "node:child_process"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { resolveTemplatesDir } from "../template-paths"

/**
 * The app's side of Outlook: the command every AI runs, and the sign-in the
 * Connected tools page drives. The command itself is one plain file shipped in
 * `templates/tools/` (copied into both packaged builds with the rest of
 * `templates/`), so the app and the AIs run the very same code.
 */
export const OUTLOOK_COMMAND = "alacran-outlook"
export const LAUNCHER_MARKER = "# alacran-outlook launcher"

export type RunCli = (args: string[]) => Promise<{ stdout: string; stderr: string }>

export function outlookScriptPath(): string {
  return path.join(resolveTemplatesDir(), "tools", "outlook-cli.mjs")
}

/** Runs the command with this server's own node: the packaged app's bundled one,
 *  which is a plain Node binary, so a machine without Node still works. */
const defaultRunCli: RunCli = (args) =>
  new Promise((resolve, reject) => {
    execFile(process.execPath, [outlookScriptPath(), ...args], { timeout: 30_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }))
      else resolve({ stdout, stderr })
    })
  })

type LauncherDeps = {
  binDir?: string
  node?: string
  script?: string
  read?: (file: string) => Promise<string>
  write?: (file: string, text: string) => Promise<void>
  makeDir?: (dir: string) => Promise<void>
}

/**
 * Puts `alacran-outlook` on the PATH so any AI that can run a shell command can
 * use it, the way `gog` is for Google. `~/.local/bin` is already on the PATH the
 * packaged apps hand to every AI (COMMON_BINS). The launcher only names this
 * machine's node and the script, so it is rewritten whenever either moves (an
 * app update, a new location) and left alone when nothing changed. A file by
 * that name that is not ours is never overwritten.
 */
export async function ensureOutlookLauncher(deps: LauncherDeps = {}): Promise<"written" | "unchanged" | "skipped"> {
  const binDir = deps.binDir ?? path.join(os.homedir(), ".local", "bin")
  const read = deps.read ?? ((file) => readFile(file, "utf-8"))
  const write =
    deps.write ??
    (async (file, text) => {
      await writeFile(file, text, "utf-8")
      await chmod(file, 0o755)
    })
  const makeDir = deps.makeDir ?? ((dir) => mkdir(dir, { recursive: true }).then(() => undefined))
  try {
    const file = path.join(binDir, OUTLOOK_COMMAND)
    const text = `#!/bin/sh\n${LAUNCHER_MARKER} (written by Alacrán; rewritten when the app moves)\nexec "${deps.node ?? process.execPath}" "${deps.script ?? outlookScriptPath()}" "$@"\n`
    const existing = await read(file).catch(() => null)
    if (existing === text) return "unchanged"
    if (existing !== null && !existing.includes(LAUNCHER_MARKER)) return "skipped"
    await makeDir(binDir)
    await write(file, text)
    return "written"
  } catch {
    return "skipped"
  }
}

export type OutlookAccount = { name: string; email: string }
export type OutlookStatus = { connected: boolean; account?: OutlookAccount | null }

function parse<T>(stdout: string): T | null {
  try {
    return JSON.parse(stdout) as T
  } catch {
    return null
  }
}

/** Who is signed in. Read from the command's own answer, never from a file this
 *  module opens, so there is one reader of the stored sign-in. */
export async function readOutlookStatus(run: RunCli = defaultRunCli): Promise<OutlookStatus> {
  try {
    const out = parse<{ connected?: boolean; account?: OutlookAccount | null }>((await run(["auth", "status"])).stdout)
    return out?.connected ? { connected: true, account: out.account ?? null } : { connected: false }
  } catch {
    return { connected: false }
  }
}

export type SignInStart =
  | { ok: true; userCode: string; verificationUri: string; deviceCode: string; expiresIn: number; interval: number }
  | { ok: false; message: string }

/** Asks Microsoft for the code the person types at a Microsoft page. */
export async function beginOutlookSignIn(run: RunCli = defaultRunCli): Promise<SignInStart> {
  try {
    const out = parse<{ userCode?: string; verificationUri?: string; deviceCode?: string; expiresIn?: number; interval?: number }>((await run(["auth", "begin"])).stdout)
    if (!out?.userCode || !out.verificationUri || !out.deviceCode) return { ok: false, message: "Microsoft didn't give a sign-in code. Try again." }
    return { ok: true, userCode: out.userCode, verificationUri: out.verificationUri, deviceCode: out.deviceCode, expiresIn: out.expiresIn ?? 900, interval: out.interval ?? 5 }
  } catch (error) {
    return { ok: false, message: cliMessage(error, "Couldn't start the Microsoft sign-in. Check your connection and try again.") }
  }
}

export type SignInPoll =
  | { status: "pending"; slowDown?: boolean }
  | { status: "ok"; account: OutlookAccount }
  | { status: "expired" | "denied" }
  | { status: "error"; message: string }

export async function pollOutlookSignIn(deviceCode: string, run: RunCli = defaultRunCli): Promise<SignInPoll> {
  if (!/^[A-Za-z0-9_-]{10,2048}$/.test(deviceCode)) return { status: "error", message: "That sign-in code isn't valid." }
  try {
    const out = parse<SignInPoll>((await run(["auth", "poll", "--device-code", deviceCode])).stdout)
    return out ?? { status: "error", message: "Microsoft gave an answer that couldn't be read." }
  } catch (error) {
    return { status: "error", message: cliMessage(error, "Couldn't check the sign-in. Try again.") }
  }
}

export async function signOutOutlook(run: RunCli = defaultRunCli): Promise<boolean> {
  try {
    await run(["auth", "logout"])
    return true
  } catch {
    return false
  }
}

/** The command prints `error: <sentence>` on failure, written for a person. */
function cliMessage(error: unknown, fallback: string): string {
  const stderr = (error as { stderr?: string }).stderr ?? ""
  const line = stderr.split("\n").find((l) => l.startsWith("error: "))
  return line ? line.slice("error: ".length) : fallback
}
