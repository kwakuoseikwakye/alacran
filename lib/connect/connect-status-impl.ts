import { memoizedExecFile } from "../exec-memo"
import { listGoogleAccountEmails, listGoogleAccounts } from "../google-accounts"
import { listAiExecutors, type AiExecutor, type AiExecutorId } from "../ai-executors"
import { getEffectiveAgents } from "../get-effective-agents"
import { getAiExecutorIdForAgent } from "../ai-executor-registry"
import { readNotionToken } from "../notion/read-notion-token"
import { isClaudeCodeCli } from "../is-claude-code-cli"
import { readClaudeAuthStatus } from "../claude-auth-status"
import type { InstallableId } from "../install-tool-impl"
import { servicesFromScopes } from "../google-services"
import type { Agent } from "../adapters/types"

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

// Memoized, not raw: this whole module is re-run on every render of Connect,
// Network and the Ownership sheet, and its `gog auth *` probes read gog's
// keyring — which on macOS can raise a Keychain prompt each time. See
// lib/exec-memo.ts; Re-check clears it.
async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return memoizedExecFile(command, args)
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
  /** google only: the service ids (lib/google-services.ts) the stored accounts
   *  REALLY carry scopes for, unioned. Derived from what gog reports, never
   *  from an assumed default — this is what stops the card claiming a service
   *  the token was never granted, and what makes adding a service to the
   *  catalog need no second edit anywhere. */
  grantedServices?: string[]
  /** google only: the same thing PER account. The union above is right for the
   *  "available to your companies" marks, but wrong for the picker that adds
   *  services to one address — it would show a second account's apps as
   *  already-on and leave them unselectable for the account that lacks them. */
  accountServices?: Record<string, string[]>
  /** google only: which setup gate is next. The commands for the `client` and
   *  `account` stages need the user's own email spliced in, so those are built
   *  in the client component from a typed address rather than shipped here
   *  with a you@example.com placeholder baked in. */
  googleStage?: GoogleStage
  /** True when a real company is assigned to this executor. Simple mode hides
   *  the non-default executors, but it must never hide one a company is
   *  actually running on — hiding a thing you haven't started using is help;
   *  hiding a thing you already depend on is concealment. */
  inUse?: boolean
  /** AI executors only: the binary is installed but nobody is signed in yet.
   *  Distinct from `!connected`, which also covers "not installed" — the UI
   *  offers Install for one and Sign in for the other, and they are different
   *  buttons. Only ever set for Claude Code, the one executor whose login
   *  state is actually readable (see lib/claude-auth-status.ts). */
  needsSignIn?: boolean
  /** Set only when this tool's BINARY is missing and there is something the
   *  app can run to fix that. The UI renders an Install button off this and
   *  nothing else — no parsing of `guidance.command`, which would guess. */
  installId?: InstallableId
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
    // Claude Code can actually answer "is the user signed in" — `claude auth
    // status` prints JSON. Every other executor genuinely can't be probed
    // without spawning a session, so they keep the installed-only answer.
    if (executor.id === "claude-code") {
      const auth = await readClaudeAuthStatus(execFn)
      if (!auth.loggedIn) {
        return {
          id: executor.id,
          label: executor.label,
          connected: false,
          needsSignIn: true,
          detail: "Installed, but not signed in yet.",
          guidance: { steps: ["Press Sign in — it opens your browser once, then you're done."] },
        }
      }
      const who = auth.email ? `Signed in as ${auth.email}` : "Signed in"
      return {
        id: executor.id,
        label: executor.label,
        connected: true,
        detail: auth.subscriptionType ? `${who} (${auth.subscriptionType}).` : `${who}.`,
        guidance: { steps: [] },
      }
    }
    return {
      id: executor.id,
      label: executor.label,
      connected: true,
      // Only Claude Code exposes a readable login state; for the rest the
      // honest proof is running a company command assigned to it.
      detail: "Installed — run an assigned company command to confirm you're signed in.",
      guidance: { steps: [] },
    }
  }
  return {
    id: executor.id,
    label: executor.label,
    connected: false,
    detail: `${executor.label} not found on your PATH.`,
    // Only the executors with a verified install command get a button; Codex
    // and Aider keep instructions, because inventing their installers is the
    // thing v64's rule exists to prevent.
    installId:
      executor.id === "claude-code" ? "claude-code" : executor.id === "google-antigravity" ? "google-antigravity" : undefined,
    guidance: {
      steps: [
        `Install ${executor.label}, then sign in with your own account.`,
        // This used to say "Fully quit and reopen the Alacrán app itself,"
        // on the belief that a freshly-installed CLI can't be seen because
        // the launcher captures PATH once at startup. Only half true, and
        // the half that matters is the other one: PATH is a list of
        // DIRECTORIES fixed at launch, but their contents are read at exec
        // time. `$HOME/.local/bin` and `/opt/homebrew/bin` are both already
        // in COMMON_BINS (scripts/package-macos.sh), and that's where the
        // native installer and Homebrew put things — so Re-check alone
        // really does find them. A relaunch is only needed for an install
        // into some directory nowhere in that list, which the buttons on
        // this page never do.
        "Press Re-check. (Installed it somewhere unusual by hand? Then quit and reopen the app.)",
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
  // Not "(Gmail & Calendar)": those are only the DEFAULTS. The card shows a
  // mark per service the token really carries (lib/google-services.ts), so
  // naming two in the title contradicts a card showing five.
  const label = "Google"
  const installStage = (detail: string): ToolStatus => ({
    id: "google",
    label,
    connected: false,
    detail,
    googleStage: "install",
    installId: "gog",
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

  // Ask `gog auth list -j` FIRST and stop there when it answers. A stored
  // account means a stored token, which is the connection — and the account
  // list is what this card actually renders. `gog auth status -j` is only
  // needed for its `credentials_exists` discriminator, i.e. exactly when there
  // is no account yet.
  //
  // This ordering is not a micro-optimization: the two commands read DIFFERENT
  // macOS Keychain items (`auth status` reports `client_secret_in_keyring`,
  // `auth list` reads the token entries), so an already-connected user was
  // being asked twice per page render instead of once. See lib/exec-memo.ts
  // for why gog can never remember the answer.
  //
  // Known, deliberate behaviour change: a machine with a stored token but a
  // DELETED credentials.json used to land on the `client` stage and now reads
  // as connected (gog will fail to refresh, and that surfaces on first use).
  // Detecting it costs the second Keychain prompt on every render for every
  // correctly-configured user, which is the bug this ordering exists to fix.
  const accounts = await listGoogleAccounts(execFn)
  if (accounts.length > 0) {
    const stored = accounts.map((a) => a.email)
    return {
      id: "google",
      label,
      connected: true,
      detail: stored.length > 1 ? `Connected: ${stored.join(", ")}.` : `Connected as ${stored[0]}.`,
      guidance: { steps: [] },
      accounts: stored,
      grantedServices: [...new Set(accounts.flatMap((a) => servicesFromScopes(a.scopes)))],
      accountServices: Object.fromEntries(accounts.map((a) => [a.email, servicesFromScopes(a.scopes)])),
    }
  }

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
    // Reached only when `gog auth list -j` gave us nothing (it failed, or its
    // JSON was malformed) yet `auth status` still names an account — so there
    // is no second account to enumerate here, and re-running `auth list` for
    // one would just be a second Keychain prompt for an answer we already have.
    return {
      id: "google",
      label,
      connected: true,
      detail: `Connected as ${email}.`,
      guidance: { steps: [] },
      accounts: [email],
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
    return {
      ...notConnected(
        "The GitHub CLI (gh) is not installed.",
        platform === "darwin" ? "brew install gh" : undefined,
        "https://cli.github.com"
      ),
      installId: "gh",
    }
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
  const assigned = new Set(
    await getAgentsFn()
      .then((all) => all.filter((a) => a.kind === "command-set"))
      .then((cs) => Promise.all(cs.map((a) => getAiExecutorIdForAgent(a.id).catch(() => undefined))))
      .catch(() => [])
  )
  const [aiExecutors, google, github, notion] = await Promise.all([
    Promise.all(
      listAiExecutors().map((e) => aiExecutorStatus(execFn, e).then((s) => (assigned.has(e.id) ? { ...s, inUse: true } : s)))
    ),
    googleStatus(execFn, platform),
    githubStatus(execFn, platform),
    notionStatus(getAgentsFn),
  ])
  return { aiExecutors, google, github, notion }
}
