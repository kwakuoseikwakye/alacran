import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { listGoogleAccountEmails } from "../google-accounts"
import { listAiExecutors, type AiExecutor, type AiExecutorId } from "../ai-executors"
import { getEffectiveAgents } from "../get-effective-agents"
import { readNotionToken } from "../notion/read-notion-token"
import { isClaudeCodeCli } from "../is-claude-code-cli"
import type { Agent } from "../adapters/types"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

/**
 * Which of Google's three setup gates the user is actually behind. `gog auth
 * setup` is a GUIDE command, not an action — run bare it prints next_steps and
 * exits with `status: guided`, `credentials_saved: false`, having done
 * nothing. This app used to offer it as THE Google command with "complete the
 * Google sign-in," so users ran it, nothing connected, and there was no next
 * step on screen. Splitting the stages is what lets each one show only the
 * command that actually advances it.
 */
export type GoogleStage = "install" | "client" | "account"

export type ToolStatus = {
  id: AiExecutorId | "google" | "github"
  label: string
  connected: boolean
  detail: string
  guidance: { steps: string[]; command?: string; link?: string }
  /** google only: every account gog auth list knows about, not just the one
   *  -a auto resolves to. Undefined for every AI executor/github. */
  accounts?: string[]
  /** google only: which setup gate is next. The commands for the `client` and
   *  `account` stages need the user's own email spliced in, so those are built
   *  in the client component from a typed address rather than shipped here
   *  with a you@example.com placeholder baked in. */
  googleStage?: GoogleStage
}

/** Unlike the other cards, Notion has no single machine-wide connected state:
 *  the api-connect skill writes NOTION_TOKEN into each company's own .env, so
 *  whether "Notion" is connected is a different answer per company. */
export type NotionCompanyStatus = { agentId: string; companyName: string; connected: boolean }
export type NotionStatus = { companies: NotionCompanyStatus[] }

export type ConnectStatus = { aiExecutors: ToolStatus[]; google: ToolStatus; github: ToolStatus; notion: NotionStatus }

async function isPresent(execFn: ExecFileFn, name: string): Promise<boolean> {
  try {
    await execFn("which", [name])
    return true
  } catch {
    return false
  }
}

/** One card per registered AI executor (lib/ai-executors.ts) — a company can
 *  be assigned any of these, so each gets its own real install status and
 *  install guidance instead of only ever checking Claude Code. */
async function aiExecutorStatus(execFn: ExecFileFn, executor: AiExecutor): Promise<ToolStatus> {
  // Claude Code specifically gets a real behavior check, not just a PATH
  // lookup: a real user had only the Claude desktop app installed, and
  // something else already on their PATH named `claude` (almost certainly a
  // Homebrew Cask launcher shim for the GUI app) made `which claude`
  // succeed anyway — see is-claude-code-cli.ts.
  const installed =
    executor.id === "claude-code" ? await isClaudeCodeCli(execFn) : await isPresent(execFn, executor.binaryName)
  if (installed) {
    return {
      id: executor.id,
      label: executor.label,
      connected: true,
      // Login state can't be detected without spawning the CLI; the honest
      // proof is running a company command assigned to it.
      detail: "Installed — run an assigned company command to confirm you're signed in.",
      guidance: { steps: [] },
    }
  }
  return {
    id: executor.id,
    label: executor.label,
    connected: false,
    detail: `${executor.label} not found on your PATH.`,
    guidance: {
      steps: [
        `Install ${executor.label}, then sign in with your own account.`,
        // "Reopen this app" is genuinely ambiguous for a freshly-installed
        // CLI: refreshing the page or clicking Re-check alone doesn't help —
        // this app's PATH is captured once when it launches (see
        // scripts/package-macos.sh), so only a full quit-and-relaunch of
        // the Alacrán app itself re-reads it. Real user confusion, not a
        // hypothetical: someone installed the CLI and the app still
        // couldn't find it because of exactly this.
        "Fully quit and reopen the Alacrán app itself (not just this browser tab), then press Re-check.",
      ],
      command: executor.installHint,
      link: executor.installLink,
    },
  }
}

type GogAuthStatus = {
  account?: { email?: unknown; credentials_exists?: unknown }
}

async function googleStatus(execFn: ExecFileFn, platform: NodeJS.Platform): Promise<ToolStatus> {
  const label = "Google (Gmail & Calendar)"
  const installStage = (detail: string): ToolStatus => ({
    id: "google",
    label,
    connected: false,
    detail,
    googleStage: "install",
    guidance: {
      steps: ["Install the Google CLI, then press Re-check."],
      // brew is macOS-only — on Linux there's no verified one-line install, so
      // just point at the repo instead of guessing a command that won't run.
      command: platform === "darwin" ? "brew install gogcli" : undefined,
      link: "https://gogcli.sh",
    },
  })

  /** The Google Cloud half. Irreducibly manual: creating an OAuth client is
   *  console-only — Google publishes no API for it, which is exactly why gog's
   *  own quickstart says to download the JSON by hand. `--open-console` was
   *  measured and rejected as the shortcut here: it refuses without gcloud
   *  ("--open-console requires --gcloud-project or an active gcloud project"),
   *  and a non-technical user has no gcloud. So this stage links the console
   *  and the client component builds the one command that finishes it. */
  const clientStage = (detail: string): ToolStatus => ({
    id: "google",
    label,
    connected: false,
    detail,
    googleStage: "client",
    guidance: { steps: [], link: "https://gogcli.sh/quickstart" },
  })

  const installed = await isPresent(execFn, "gog")
  if (!installed) return installStage("The gog (Google CLI) is not installed.")

  let raw: string
  try {
    const res = await execFn("gog", ["auth", "status", "-j"])
    raw = res.stdout
  } catch {
    return clientStage("Couldn't read Google auth status.")
  }

  let parsed: GogAuthStatus
  try {
    parsed = JSON.parse(raw) as GogAuthStatus
  } catch {
    return clientStage("Couldn't read Google auth status.")
  }

  const email = typeof parsed.account?.email === "string" ? parsed.account.email.trim() : ""
  const hasCredentials = parsed.account?.credentials_exists === true

  if (email && hasCredentials) {
    // gog already supports more than one stored account (gog auth add,
    // -a <email|alias|auto> per call) — list every one of them, not just
    // whichever "auto" happens to resolve to, so a second/third account can
    // be assigned to a different company.
    const accounts = await listGoogleAccountEmails(execFn)
    const detail =
      accounts.length > 1 ? `Connected: ${accounts.join(", ")}.` : `Connected as ${email}.`
    return {
      id: "google",
      label,
      connected: true,
      detail,
      guidance: { steps: [] },
      accounts: accounts.length > 0 ? accounts : [email],
    }
  }

  // credentials_exists is file-backed (credentials_path under gog's own home),
  // so it flips independently of `email` — measured against a disposable
  // `gog --home` where credentials_exists went false while email still read
  // back from the OS keyring. That's what makes it the reliable discriminator
  // between "no OAuth client yet" and "client stored, just needs authorizing."
  if (!hasCredentials) return clientStage("No Google sign-in set up yet.")

  return {
    id: "google",
    label,
    connected: false,
    detail: "Almost there — the hard part is done, one command left.",
    googleStage: "account",
    guidance: { steps: [] },
  }
}

/**
 * GitHub is what makes a company survive losing the machine: the app can create
 * the repo and push for you, but only once `gh` is installed and signed in.
 *
 * Creating a GitHub ACCOUNT is a browser signup (email verification, CAPTCHA,
 * terms) that no local tool can do on the user's behalf — same boundary as
 * `gog auth setup`. So this detects and guides, and the automation picks up
 * from `gh auth login` onward.
 */
async function githubStatus(execFn: ExecFileFn, platform: NodeJS.Platform): Promise<ToolStatus> {
  const label = "GitHub (company backup)"
  const notConnected = (detail: string, command?: string, link?: string): ToolStatus => ({
    id: "github",
    label,
    connected: false,
    detail,
    guidance: {
      steps: [
        "Run the command below and follow the browser sign-in.",
        "No GitHub account yet? The same command offers to create one.",
        "Come back and press Re-check.",
      ],
      command,
      link,
    },
  })

  if (!(await isPresent(execFn, "gh"))) {
    // brew is macOS-only. gh's own docs actively discourage the Linux snap
    // package, and the real apt-repo install is multi-step, not a one-liner —
    // so Linux gets the install link instead of a fabricated command.
    return notConnected(
      "The GitHub CLI (gh) is not installed.",
      platform === "darwin" ? "brew install gh" : undefined,
      "https://cli.github.com"
    )
  }

  // `gh api user` is the cleanest signed-in probe: it returns the login name
  // as plain text and exits non-zero when unauthenticated.
  try {
    const { stdout } = await execFn("gh", ["api", "user", "--jq", ".login"])
    const login = stdout.trim()
    if (!login) return notConnected("Not signed in to GitHub yet.", "gh auth login")
    return {
      id: "github",
      label,
      connected: true,
      detail: `Signed in as ${login}. Companies can be backed up to private repos.`,
      guidance: { steps: [] },
    }
  } catch {
    return notConnected("Not signed in to GitHub yet.", "gh auth login")
  }
}

/** Only command-set companies have a .claude/commands to run api-connect or
 *  check-notion from at all — the pipeline/report-log built-ins don't apply. */
async function notionStatus(getAgentsFn: () => Promise<Agent[]>): Promise<NotionStatus> {
  const agents = await getAgentsFn()
  const commandSetAgents = agents.filter((a) => a.kind === "command-set")
  const companies = await Promise.all(
    commandSetAgents.map(async (agent) => ({
      agentId: agent.id,
      companyName: agent.name,
      connected: Boolean(await readNotionToken(agent.rootPath)),
    }))
  )
  return { companies }
}

export async function getConnectStatusImpl(
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform,
  getAgentsFn: () => Promise<Agent[]> = getEffectiveAgents
): Promise<ConnectStatus> {
  const [aiExecutors, google, github, notion] = await Promise.all([
    Promise.all(listAiExecutors().map((e) => aiExecutorStatus(execFn, e))),
    googleStatus(execFn, platform),
    githubStatus(execFn, platform),
    notionStatus(getAgentsFn),
  ])
  return { aiExecutors, google, github, notion }
}
