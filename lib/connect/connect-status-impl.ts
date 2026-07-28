import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type ToolStatus = {
  id: "claude" | "google"
  label: string
  connected: boolean
  detail: string
  guidance: { steps: string[]; command?: string; link?: string }
}

export type ConnectStatus = { claude: ToolStatus; google: ToolStatus }

async function isPresent(execFn: ExecFileFn, name: string): Promise<boolean> {
  try {
    await execFn("which", [name])
    return true
  } catch {
    return false
  }
}

async function claudeStatus(execFn: ExecFileFn): Promise<ToolStatus> {
  const installed = await isPresent(execFn, "claude")
  if (installed) {
    return {
      id: "claude",
      label: "AI agent (Claude Code)",
      connected: true,
      // Login state can't be detected without spawning claude; the honest proof
      // of login is running a company command.
      detail: "Installed — run any company command to confirm your Claude login.",
      guidance: { steps: [] },
    }
  }
  return {
    id: "claude",
    label: "AI agent (Claude Code)",
    connected: false,
    detail: "Claude Code CLI not found on your PATH.",
    guidance: {
      steps: [
        "Install Claude Code, then sign in to your Claude subscription.",
        "Reopen this app or press Re-check.",
      ],
      command: "npm install -g @anthropic-ai/claude-code",
      link: "https://docs.claude.com/en/docs/claude-code/overview",
    },
  }
}

type GogAuthStatus = {
  account?: { email?: unknown; credentials_exists?: unknown }
}

async function googleStatus(execFn: ExecFileFn): Promise<ToolStatus> {
  const label = "Google (Gmail & Calendar)"
  const notConnected = (detail: string, command: string, link?: string): ToolStatus => ({
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
    return notConnected(
      "The gog (Google CLI) is not installed.",
      "brew install gogcli/tap/gog",
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
    return {
      id: "google",
      label,
      connected: true,
      detail: `Connected as ${email}.`,
      guidance: { steps: [] },
    }
  }

  return notConnected("No Google account connected yet.", "gog auth setup")
}

export async function getConnectStatusImpl(execFn: ExecFileFn = defaultExecFile): Promise<ConnectStatus> {
  const [claude, google] = await Promise.all([claudeStatus(execFn), googleStatus(execFn)])
  return { claude, google }
}
