import { spawn as defaultSpawn, execFile as nodeExecFile, type ChildProcess } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { buildInteractiveTerminalScript } from "./company-commands/build-visible-run-script"
import { resolveTerminalLaunchCommand, type ExecFileFn } from "./terminal-launch-command"
import { GOOGLE_CONSOLE_STEPS } from "./google-console-steps"
import { isPlausibleEmail } from "./sign-in-claude-impl"
import { DATA_DIR } from "./data-dir"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type SpawnFn = (command: string, args: string[], opts: Record<string, unknown>) => ChildProcess
export type SetupGoogleResult = { started: boolean; message: string }

/**
 * The scopes this app actually uses. Kept deliberately narrow (v64): every
 * extra service is another API the user — or here, the agent — must click
 * Enable on, and `GOOGLE_SURFACE` in connect-panel.tsx shows marks for
 * exactly these. Widening this list means widening that one too, or the card
 * promises a connection it doesn't have.
 */
export const GOOGLE_SETUP_SERVICES = "gmail,calendar"

/**
 * The checklist the browser agent works through — built from the SAME array
 * the user is shown on the card, so the two can never drift.
 *
 * What makes this bounded rather than "operate Google for the user": the
 * agent's real deliverable is ONE artifact, a Desktop OAuth client JSON in
 * ~/Downloads. Everything after that is a single deterministic gog command,
 * which is why the final step names it exactly rather than leaving the agent
 * to improvise the finish.
 */
export function buildGoogleSetupPrompt(email: string): string {
  const steps = GOOGLE_CONSOLE_STEPS.map((s, i) => `${i + 1}. ${s.title} — ${s.href}\n   ${s.then}`).join("\n")
  return [
    `Set up Google API access for ${email} on this machine, using the browser.`,
    "",
    "Google publishes no API for creating an OAuth client, so this genuinely has to be done by clicking through the Cloud Console. Work through these pages in order:",
    "",
    steps,
    "",
    "Important:",
    `- FIRST check which Google account the browser is signed in as. If it is not ${email}, stop and tell me — do not click anything. Setting this up on the wrong account silently connects the wrong mailbox.`,
    `- On the "Say who can use it" step, enter ${email}.`,
    `- Choose "Desktop app" as the client type. Any other type produces credentials gog cannot use.`,
    "- Do not skip the Publish step. Without it Google expires the connection after 7 days.",
    "- Do not enable any API beyond Gmail and Calendar, and do not create billing or service accounts.",
    "",
    "When the JSON has downloaded (it lands in ~/Downloads and is named something like client_secret_….apps.googleusercontent.com.json), finish by running exactly:",
    "",
    `  gog auth setup ${email} --credentials <the downloaded file> --services ${GOOGLE_SETUP_SERVICES} --login`,
    "",
    "That stores the key and opens the browser sign-in. Approve it. Then run `gog auth list` and show me the output so we can both see it worked.",
  ].join("\n")
}

/**
 * Is Google Chrome actually on this machine?
 *
 * This one IS checkable, and it's a hard prerequisite: `claude --chrome`
 * drives Chrome specifically, so without it the button would open a terminal
 * that fails after the user has already typed their address and pressed go.
 * `open -Ra` resolves a bundle without launching it — exit 0 present, exit 1
 * absent, measured directly rather than assumed.
 *
 * Whether the user is SIGNED IN to Google, and as whom, is deliberately not
 * checked here: there is no API for it, and reading Chrome's own profile or
 * cookie store to find out would be both fragile and a bigger intrusion than
 * this feature is worth. That half is a confirmation the user gives, backed
 * by the agent re-checking it in-browser before it clicks anything.
 */
export async function isChromeInstalled(execFn: ExecFileFn, platform: NodeJS.Platform): Promise<boolean> {
  if (platform === "darwin") {
    try {
      await execFn("open", ["-Ra", "Google Chrome"])
      return true
    } catch {
      return false
    }
  }
  // Distros disagree on the binary name; `google-chrome` is a symlink on some
  // and absent on others where only `google-chrome-stable` exists.
  for (const binary of ["google-chrome", "google-chrome-stable"]) {
    try {
      await execFn("which", [binary])
      return true
    } catch {
      /* try the next name */
    }
  }
  return false
}

/** Opens CHROME — not the default browser — at Google's account page, so the
 *  user can see which account they're signed in as and switch if needed. The
 *  distinction matters: a user whose default browser is Safari would
 *  otherwise verify the wrong browser entirely, and the agent drives Chrome. */
export async function openChromeAccountCheckImpl(
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform
): Promise<{ opened: boolean }> {
  try {
    if (platform === "darwin") {
      // `open` returns as soon as it hands off to LaunchServices.
      await execFn("open", ["-a", "Google Chrome", "https://myaccount.google.com"])
      return { opened: true }
    }
    // On Linux the browser binary does NOT return until the browser exits, so
    // awaiting it would hang this action for as long as the window is open.
    // Fire it and report success on hand-off, the same contract as macOS.
    void execFn("google-chrome", ["https://myaccount.google.com"]).catch(() => {})
    return { opened: true }
  } catch {
    return { opened: false }
  }
}

/**
 * Opens a real Terminal running Claude Code with its Chrome integration, told
 * to do the Google Cloud Console setup in the user's own already-signed-in
 * browser.
 *
 * Visible, not headless, on purpose — three reasons, all of which point the
 * same way. The agent is operating the user's real Google account, so the
 * user should watch it. The console can interrupt with a terms-acceptance or
 * billing interstitial that nobody can enumerate in advance, and a visible
 * session lets the user take over instead of the run dying. And the final
 * `gog ... --login` step opens a browser consent screen that has to be
 * approved by a human anyway.
 *
 * Claude Code only: `--chrome` is its own flag and has no equivalent in
 * Codex, Aider or Antigravity. The caller gates on that.
 */
export async function setupGoogleImpl(
  email: string,
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform,
  dataDir: string = DATA_DIR,
  home: string = homedir()
): Promise<SetupGoogleResult> {
  const address = email.trim()
  // Reuses the sign-in validator rather than a second opinion on what an
  // address is. This one is spliced into a prompt AND a generated script, so
  // the NUL/control-character half matters as much as the shape half.
  if (!isPlausibleEmail(address)) {
    return { started: false, message: "Enter the Google address you want to connect first." }
  }

  // Hard prerequisite, checked before anything is spawned: the agent drives
  // Chrome, so no Chrome means no run — and finding that out from a terminal
  // that flashes an error is exactly the dead end this slice removes.
  if (!(await isChromeInstalled(execFn, platform))) {
    return {
      started: false,
      message: "Google Chrome isn't installed. Your AI needs it to click through Google's pages — install Chrome, then try again.",
    }
  }

  const launch = await resolveTerminalLaunchCommand(platform, execFn)
  if (!launch) {
    return { started: false, message: "No supported terminal found on this machine." }
  }

  const script = buildInteractiveTerminalScript({
    binaryName: "claude",
    cwd: home,
    introArgs: ["--chrome", buildGoogleSetupPrompt(address)],
  })
  const scriptPath = path.join(dataDir, "google-setup.sh")
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
  // v56: an 'error' with no listener takes the server down.
  child.on("error", () => {})
  child.unref()

  return {
    started: true,
    message: "Opened a session that will do the Google setup in your browser. Watch it, then press Re-check.",
  }
}
