import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { listGoogleAccountEmails } from "../google-accounts"
import { listAiExecutors, type AiExecutor, type AiExecutorId } from "../ai-executors"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type ToolStatus = {
  id: AiExecutorId | "google" | "github"
  label: string
  connected: boolean
  detail: string
  guidance: { steps: string[]; command?: string; link?: string }
  /** google only: every account gog auth list knows about, not just the one
   *  -a auto resolves to. Undefined for every AI executor/github. */
  accounts?: string[]
}

export type ConnectStatus = { aiExecutors: ToolStatus[]; google: ToolStatus; github: ToolStatus }

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
  const installed = await isPresent(execFn, executor.binaryName)
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
      steps: [`Install ${executor.label}, then sign in with your own account.`, "Reopen this app or press Re-check."],
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
  const notConnected = (detail: string, command?: string, link?: string): ToolStatus => ({
    id: "google",
    label,
    connected: false,
    detail,
    guidance: {
      steps: [
        "Run the command below in your terminal and complete the Google sign-in.",
        "Come back and press Re-check.",
      ],
      command,
      link,
    },
  })

  const installed = await isPresent(execFn, "gog")
  if (!installed) {
    // brew is macOS-only — on Linux there's no verified one-line install, so
    // just point at the repo instead of guessing a command that won't run.
    return notConnected(
      "The gog (Google CLI) is not installed.",
      platform === "darwin" ? "brew install gogcli/tap/gog" : undefined,
      "https://github.com/gogcli/gog"
    )
  }

  let raw: string
  try {
    const res = await execFn("gog", ["auth", "status", "-j"])
    raw = res.stdout
  } catch {
    return notConnected("Couldn't read Google auth status.", "gog auth setup")
  }

  let parsed: GogAuthStatus
  try {
    parsed = JSON.parse(raw) as GogAuthStatus
  } catch {
    return notConnected("Couldn't read Google auth status.", "gog auth setup")
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

  return notConnected("No Google account connected yet.", "gog auth setup")
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

export async function getConnectStatusImpl(
  execFn: ExecFileFn = defaultExecFile,
  platform: NodeJS.Platform = process.platform
): Promise<ConnectStatus> {
  const [aiExecutors, google, github] = await Promise.all([
    Promise.all(listAiExecutors().map((e) => aiExecutorStatus(execFn, e))),
    googleStatus(execFn, platform),
    githubStatus(execFn, platform),
  ])
  return { aiExecutors, google, github }
}
