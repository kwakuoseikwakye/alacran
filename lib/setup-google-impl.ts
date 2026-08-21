import { spawn as defaultSpawn, execFile as nodeExecFile, type ChildProcess } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { buildInteractiveTerminalScript } from "./company-commands/build-visible-run-script"
import { resolveTerminalLaunchCommand, launchTerminalScript, type ExecFileFn } from "./terminal-launch-command"
import { GOOGLE_CONSOLE_STEPS } from "./google-console-steps"
import { GOOGLE_SERVICES, DEFAULT_GOOGLE_SERVICE_IDS, serviceListArg, servicesFromScopes } from "./google-services"
import { listGoogleAccounts, type GoogleAccount } from "./google-accounts"
import { isPlausibleEmail } from "./sign-in-claude-impl"
import { DATA_DIR } from "./data-dir"
import { listChromeProfiles, findProfileForEmail, type ChromeProfile } from "./chrome-profiles"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type SpawnFn = (command: string, args: string[], opts: Record<string, unknown>) => ChildProcess
export type SetupGoogleResult = { started: boolean; message: string }

// Distros disagree on the binary name; `google-chrome` is a symlink on some and
// absent on others where only `google-chrome-stable` exists. One list, because
// the two functions below asking this two different ways is exactly how a
// machine passed the installed-check and then silently did nothing.
const LINUX_CHROME_BINARIES = ["google-chrome", "google-chrome-stable"]

const MAC_CHROME_BINARY = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const ACCOUNT_PAGE = "https://myaccount.google.com"

/**
 * The scopes this app actually uses. Kept deliberately narrow (v64): every
 * extra service is another API the user — or here, the agent — must click
 * Enable on, and `GOOGLE_SURFACE` in connect-panel.tsx shows marks for
 * exactly these. Widening this list means widening that one too, or the card
 * promises a connection it doesn't have.
 */
/** Kept as the fallback when a caller passes nothing, so behaviour is
 *  unchanged for every existing path. The picker on the Connect card supplies
 *  a real selection. */
export const GOOGLE_SETUP_SERVICES = serviceListArg(DEFAULT_GOOGLE_SERVICE_IDS)

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
export function buildGoogleSetupPrompt(
  email: string,
  serviceIds: string[] = DEFAULT_GOOGLE_SERVICE_IDS,
  /** Services this account ALREADY carries. Non-empty means the one-time
   *  console setup is done, so the agent gets the much shorter job below. */
  grantedIds: string[] = [],
  /** The Chrome profile directory signed in as this address, when the caller
   *  could determine one. Named in the prompt because a machine with several
   *  profiles has several signed-in accounts, and "the browser" is ambiguous. */
  profileDirectory: string | null = null
): string {
  if (grantedIds.length > 0) return buildGoogleExpandPrompt(email, serviceIds, grantedIds, profileDirectory)
  const services = serviceListArg(serviceIds)
  const chosen = GOOGLE_SERVICES.filter((svc) => services.split(",").includes(svc.id))
  // The console checklist is built from the chosen services, not a fixed pair:
  // consent FAILS for a service whose API was never enabled, so the two lists
  // have to be the same list. GOOGLE_CONSOLE_STEPS still supplies every step
  // that isn't per-API (create project, consent screen, client, publish).
  const enableSteps = chosen.map((svc) => `Turn on ${svc.label} — ${svc.apiPage}\n   Click the blue Enable button. That is the whole step.`)
  const otherSteps = GOOGLE_CONSOLE_STEPS.filter((s) => !s.title.startsWith("Turn on")).map((s) => `${s.title} — ${s.href}\n   ${s.then}`)
  const steps = [otherSteps[0], ...enableSteps, ...otherSteps.slice(1)]
    .map((line, i) => `${i + 1}. ${line}`)
    .join("\n")
  return [
    `Set up Google API access for ${email} on this machine, using the browser.`,
    "",
    "Google publishes no API for creating an OAuth client, so this genuinely has to be done by clicking through the Cloud Console. Work through these pages in order:",
    "",
    steps,
    "",
    "Important:",
    profileDirectory
      ? `- This machine has more than one Chrome profile. Use the one signed in as ${email} — Chrome calls it "${profileDirectory}". Switch to it first if the window you get is on a different account.`
      : `- FIRST check which Google account the browser is signed in as.`,
    `- If the browser is not signed in as ${email}, stop and tell me — do not click anything. Setting this up on the wrong account silently connects the wrong mailbox.`,
    `- On the "Say who can use it" step, enter ${email}.`,
    `- Choose "Desktop app" as the client type. Any other type produces credentials gog cannot use.`,
    "- Do not skip the Publish step. Without it Google expires the connection after 7 days.",
    `- Enable exactly the APIs listed above (${chosen.map((c) => c.label).join(", ")}) and nothing else, and do not create billing or service accounts.`,
    "",
    "When the JSON has downloaded (it lands in ~/Downloads and is named something like client_secret_….apps.googleusercontent.com.json), finish by running exactly:",
    "",
    `  gog auth setup ${email} --credentials <the downloaded file> --services ${services} --login`,
    "",
    "That stores the key and opens the browser sign-in. Approve it. Then run `gog auth list` and show me the output so we can both see it worked.",
  ].join("\n")
}

/**
 * The much shorter job for an account that is ALREADY connected — the case
 * every user who installed before the service picker existed is in: gmail and
 * calendar authorized, no way to reach Drive/Docs/Sheets without redoing a
 * setup they already did.
 *
 * The OAuth client, consent screen and Publish step are one-time and already
 * done, so all that's left is the per-API Enable click for each NEW service
 * plus one re-consent. `gog auth add` is the same command that connects a
 * fresh address — re-running it on a stored account re-authorizes it with
 * whatever `--services` asks for, which is why the list is the UNION and
 * never just the new ones: requesting a narrower set is how you'd silently
 * drop Gmail from an account that had it.
 */
function buildGoogleExpandPrompt(
  email: string,
  serviceIds: string[],
  grantedIds: string[],
  profileDirectory: string | null = null
): string {
  const services = serviceListArg([...grantedIds, ...serviceIds])
  const already = GOOGLE_SERVICES.filter((svc) => grantedIds.includes(svc.id))
  const added = GOOGLE_SERVICES.filter((svc) => services.split(",").includes(svc.id) && !grantedIds.includes(svc.id))
  const steps = added
    .map((svc, i) => `${i + 1}. Turn on ${svc.label} — ${svc.apiPage}\n   Click the blue Enable button. That is the whole step.`)
    .join("\n")
  return [
    `Add more Google apps to ${email} on this machine, using the browser.`,
    "",
    `This account is already connected for ${already.map((s) => s.label).join(", ") || "some services"}. The one-time Google Cloud setup (project, consent screen, OAuth client, publishing) is already done — do NOT create a new project, a new client, or new credentials. Only turn on the extra APIs, then re-authorize.`,
    "",
    added.length > 0 ? `Enable these APIs in the existing project:\n\n${steps}` : "No new APIs need enabling.",
    "",
    "Important:",
    profileDirectory
      ? `- This machine has more than one Chrome profile. Use the one signed in as ${email} — Chrome calls it "${profileDirectory}".`
      : `- FIRST check which Google account the browser is signed in as.`,
    `- If the browser is not signed in as ${email}, stop and tell me — do not click anything.`,
    "- If the console shows more than one project, use the one that already has the other APIs turned on. Ask me if it isn't obvious which.",
    "- Do not create billing accounts, service accounts, or a second OAuth client.",
    "",
    "Then finish by running exactly:",
    "",
    `  gog auth add ${email} --services ${services}`,
    "",
    // The union is spelled out because an agent "helpfully" trimming this to
    // the new services would revoke the ones the user already had.
    `That list is deliberately everything this account should end up with, not just the new ones — run it exactly as written. It opens the browser sign-in; approve it. Then run \`gog auth list\` and show me the output so we can both see the new apps are there.`,
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
 * WHICH Google account it is signed in as is answered separately, by
 * lib/chrome-profiles.ts. This used to say there was no way to know and left it
 * to a checkbox — wrong: there is no web API, but Chrome writes each profile's
 * signed-in address to a plain JSON file, and a machine with three profiles
 * (as the report that prompted this had) otherwise gets whichever one Chrome
 * used last.
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
  for (const binary of LINUX_CHROME_BINARIES) {
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
 *  otherwise verify the wrong browser entirely, and the agent drives Chrome.
 *
 *  Opens the PROFILE signed in as `email` where one exists. Without that this
 *  showed whichever profile Chrome used last, so on a multi-profile machine the
 *  user was invited to confirm an account that had nothing to do with the
 *  address they typed — and then tick a box saying it matched. */
export async function openChromeAccountCheckImpl(
  email: string = "",
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform,
  listProfilesFn: () => Promise<ChromeProfile[]> = () => listChromeProfiles(platform)
): Promise<{ opened: boolean; profile: string | null }> {
  const match = email.trim() ? findProfileForEmail(await listProfilesFn(), email) : null
  const profileArgs = match ? [`--profile-directory=${match.directory}`] : []
  try {
    if (platform === "darwin") {
      if (match) {
        // `open --args` is ignored when Chrome is already running, which is
        // exactly when profile selection matters. The binary honours the flag
        // either way, and (like Linux) does not return until Chrome exits, so
        // it is fired rather than awaited.
        void execFn(MAC_CHROME_BINARY, [...profileArgs, ACCOUNT_PAGE]).catch(() => {})
        return { opened: true, profile: match.directory }
      }
      // `open` returns as soon as it hands off to LaunchServices.
      await execFn("open", ["-a", "Google Chrome", ACCOUNT_PAGE])
      return { opened: true, profile: null }
    }
    // `isChromeInstalled` accepts either name, so hardcoding one here meant a
    // machine carrying only google-chrome-stable passed that check and then
    // did nothing at all: the ENOENT went into the `.catch(() => {})` below
    // and this still reported `opened: true`. Resolve first, then fire.
    for (const binary of LINUX_CHROME_BINARIES) {
      try {
        await execFn("which", [binary])
      } catch {
        continue
      }
      // On Linux the browser binary does NOT return until the browser exits,
      // so awaiting it would hang this action for as long as the window is
      // open. Fire it and report success on hand-off, the same contract as
      // macOS.
      void execFn(binary, [...profileArgs, ACCOUNT_PAGE]).catch(() => {})
      return { opened: true, profile: match?.directory ?? null }
    }
    return { opened: false, profile: null }
  } catch {
    return { opened: false, profile: null }
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
  serviceIds: string[] = DEFAULT_GOOGLE_SERVICE_IDS,
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform,
  dataDir: string = DATA_DIR,
  home: string = homedir(),
  /** Its own seam, NOT `listGoogleAccounts(execFn)`. That call read gog's
   *  keyring through this module's raw execFile, bypassing the v70 memo that
   *  lives on listGoogleAccounts' own default — so every click added a
   *  Keychain prompt, which is precisely what v70 exists to stop. Passing the
   *  shared `execFn` down is not an option either: `defaultExecFile` here is
   *  also what openChromeAccountCheckImpl uses, and memoizing THAT would turn
   *  a second "Open Chrome and check" click into a silent no-op. */
  listAccountsFn: () => Promise<GoogleAccount[]> = () => listGoogleAccounts(),
  /** Trailing, so every existing call site and test keeps working untouched
   *  (the v46 rule). Its own seam rather than a shared exec: this reads a file,
   *  not a process. */
  listProfilesFn: () => Promise<ChromeProfile[]> = () => listChromeProfiles(platform, home)
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

  // Which Chrome profile is signed in as this address. The agent operates the
  // user's real Google account, so this is the difference between connecting
  // the mailbox they asked for and silently connecting a different one — and
  // it is a hard gate, not a hint, because the previous version's only guard
  // was a sentence in the prompt asking the model to notice and stop.
  //
  // Empty means Chrome's Local State could not be read at all (not installed
  // the usual way, a reshaped file, a locked-down home). That is "can't tell",
  // not "no match", so it falls through to the old behaviour rather than
  // blocking a setup that would have worked.
  // ponytail: this app can pick the right profile and refuse a wrong one, but
  // it cannot force which window `claude --chrome` attaches to — that is Claude
  // Code's own behaviour. So the profile is ALSO named in the prompt, and the
  // agent is still told to stop if the account is wrong. Tighten this if Claude
  // Code ever grows a profile flag of its own.
  const profiles = await listProfilesFn()
  const profile = findProfileForEmail(profiles, address)
  if (profiles.length > 0 && !profile) {
    const known = profiles.map((p) => p.email).join(", ")
    return {
      started: false,
      message: `No Chrome profile on this machine is signed in as ${address}. Chrome here is signed in as ${known}. Sign in to Chrome as ${address} first, or type one of those addresses instead — otherwise the setup would connect the wrong account.`,
    }
  }

  const launch = await resolveTerminalLaunchCommand(platform, execFn)
  if (!launch) {
    return { started: false, message: "No supported terminal found on this machine." }
  }

  // Which job this is — first-time setup or "add more apps to an account that
  // already works" — is read off the machine, not passed in from the client.
  // Same call the card already made, through the same 5-minute memo, so this
  // is usually free; and it answers both halves at once: does this address
  // already have a token, and what scopes does it carry.
  const stored = (await listAccountsFn()).find(
    (a) => a.email.toLowerCase() === address.toLowerCase()
  )
  const granted = stored ? servicesFromScopes(stored.scopes) : []

  const script = buildInteractiveTerminalScript({
    binaryName: "claude",
    cwd: home,
    introArgs: ["--chrome", buildGoogleSetupPrompt(address, serviceIds, granted, profile?.directory ?? null)],
  })
  const scriptPath = path.join(dataDir, "google-setup.sh")
  // DATA_DIR is created lazily by whichever feature writes first. On a fresh
  // install nothing has, so this must not assume it exists — the failure is an
  // ENOENT reported to the user as "couldn't open a terminal", on the exact
  // path this whole slice exists to make work.
  await mkdir(dataDir, { recursive: true })
  await writeFile(scriptPath, script, { mode: 0o755 })

  const outcome = await launchTerminalScript(launch, scriptPath, home, spawnFn)
  if (!outcome.opened) {
    return { started: false, message: `Couldn't open a terminal — ${outcome.reason}` }
  }

  return {
    started: true,
    message: "Opened a session that will do the Google setup in your browser. Watch it, then press Re-check.",
  }
}
