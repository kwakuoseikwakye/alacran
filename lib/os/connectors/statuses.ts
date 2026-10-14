import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { runtimeEnv } from "./creds"
import { isBinaryPresent } from "@/lib/binary-present"
import { memoizedExecFile } from "@/lib/exec-memo"
import { readClaudeAuthStatus } from "@/lib/claude-auth-status"
import { readKiroAuthStatus } from "@/lib/kiro-auth-status"
import { listGoogleAccounts } from "@/lib/google-accounts"
import { readOutlookStatus } from "@/lib/outlook/outlook"
import { resolveCredential } from "@/lib/credentials/resolve"
import type { CredentialSource } from "@/lib/credentials/resolve"

export type ConnectorState = "connected" | "not_configured" | "error"

export type ConnectorKind =
  | "email"
  | "calendar"
  | "slack"
  | "payments"
  | "notion"
  | "brain"
  | "social"
  | "crm"
  | "ads"
  | "creative"
  | "knowledge"
  | "local"
  | "orchestration"
  | "developer"

export type ConnectorStatus = {
  id: string
  name: string
  kind: ConnectorKind
  state: ConnectorState
  detail: string
  meta?: Record<string, string | number>
  source?: CredentialSource
}

async function brainStatus(): Promise<ConnectorStatus> {
  return {
    id: "gbrain",
    name: "G-Brain",
    kind: "brain",
    state: "connected",
    detail: "Active neural memory graph & company ontology connected",
    meta: { provider: "local-graph" },
  }
}

async function llmStatus(env: Record<string, string | undefined>): Promise<ConnectorStatus> {
  const keys = [
    env.ANTHROPIC_API_KEY ? "Anthropic" : null,
    env.OPENAI_API_KEY ? "OpenAI" : null,
    env.GEMINI_API_KEY ? "Gemini" : null,
  ].filter(Boolean)
  if (keys.length > 0) {
    return {
      id: "llm",
      name: "LLM Provider",
      kind: "orchestration",
      state: "connected",
      detail: `Active models configured: ${keys.join(", ")}`,
    }
  }
  return {
    id: "llm",
    name: "LLM Provider",
    kind: "orchestration",
    state: "not_configured",
    detail: "Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local",
  }
}

async function whatsappStatus(): Promise<ConnectorStatus> {
  const containers = [
    path.join(os.homedir(), "Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite"),
    path.join(os.homedir(), "Library/Group Containers/group.net.whatsapp.WhatsAppSMB.shared/ChatStorage.sqlite"),
  ]
  const existing = containers.find((p) => fs.existsSync(p))
  if (existing) {
    try {
      fs.accessSync(existing, fs.constants.R_OK)
      return {
        id: "whatsapp",
        name: "WhatsApp",
        kind: "social",
        state: "connected",
        detail: `Connected to local SQLite container (${existing.includes("SMB") ? "Business" : "Personal"})`,
      }
    } catch {
      return {
        id: "whatsapp",
        name: "WhatsApp",
        kind: "social",
        state: "error",
        detail: "ChatStorage.sqlite found but macOS withheld Full Disk Access.",
      }
    }
  }
  return {
    id: "whatsapp",
    name: "WhatsApp",
    kind: "social",
    state: "not_configured",
    detail: "ChatStorage.sqlite not found. Sign in to WhatsApp desktop app.",
  }
}

async function obsidianStatus(): Promise<ConnectorStatus> {
  const vault = process.env.OBSIDIAN_VAULT ?? path.join(os.homedir(), "Documents", "Notes Vault")
  if (fs.existsSync(vault)) {
    return {
      id: "obsidian",
      name: "Notes Vault",
      kind: "knowledge",
      state: "connected",
      detail: `Connected markdown vault at ${vault.replace(os.homedir(), "~")}`,
    }
  }
  return {
    id: "obsidian",
    name: "Notes Vault",
    kind: "knowledge",
    state: "not_configured",
    detail: "Vault not found. Set OBSIDIAN_VAULT in .env.local to link your markdown notes.",
  }
}

/**
 * A status resolved from the machine default SAYS so. The whole point of
 * per-company credentials is knowing which one you are about to spend money
 * with; a bare "Connected" over an inherited Stripe key is the failure mode
 * this feature exists to prevent.
 */
export function paymentsDetail(processors: string[], source: CredentialSource): string {
  if (processors.length === 0) {
    return "No payment processor for this company. Add one in Connections, or give this company its own."
  }
  const names = processors.join(", ")
  return source === "machine" ? `${names} configured — machine default` : `${names} configured`
}

/**
 * Reduces the sources behind the payments row to one. "machine" wins over
 * "company" whenever both are present: a company with its own Stripe key AND
 * an inherited PayPal default must still say "machine default" overall, or
 * the inherited processor is silently presented as the company's own — the
 * exact wrong-account risk this feature exists to prevent. Under-warning
 * costs a charge on the wrong account; over-warning costs a word.
 */
export function reducePaymentsSource(sources: CredentialSource[]): CredentialSource {
  if (sources.some((s) => s === "machine")) return "machine"
  if (sources.some((s) => s === "company")) return "company"
  return "unset"
}

/**
 * Where the email row's credential actually came from.
 *
 * INBOX_1 is the only inbox resolved company-first; INBOX_2_USER, GMAIL_USER
 * and SMTP_USER are read straight off the machine's `.env.local`, so a row
 * connected through one of them is connected through the MACHINE, not
 * through nothing. This returned "unset" for that case until nothing read it
 * — the moment a row summary does, "unset" renders as "Not connected yet",
 * which is false for an inbox that is demonstrably working.
 */
export function emailSource(
  inbox1Source: CredentialSource | null,
  hasFallbackInbox: boolean
): CredentialSource {
  if (inbox1Source) return inbox1Source
  return hasFallbackInbox ? "machine" : "unset"
}

async function paymentsStatus(agentRootPath: string | null): Promise<ConnectorStatus> {
  const [stripe, paypalId, paypalSecret, square, whop] = await Promise.all([
    resolveCredential(agentRootPath, "STRIPE_SECRET_KEY"),
    resolveCredential(agentRootPath, "PAYPAL_CLIENT_ID"),
    resolveCredential(agentRootPath, "PAYPAL_CLIENT_SECRET"),
    resolveCredential(agentRootPath, "SQUARE_ACCESS_TOKEN"),
    resolveCredential(agentRootPath, "WHOP_API_KEY"),
  ])

  const procs: string[] = []
  const sources: CredentialSource[] = []
  if (stripe.value) {
    procs.push("Stripe")
    sources.push(stripe.source)
  }
  if (paypalId.value && paypalSecret.value) {
    procs.push("PayPal")
    sources.push(paypalId.source, paypalSecret.source)
  }
  if (square.value) {
    procs.push("Square")
    sources.push(square.source)
  }
  if (whop.value) {
    procs.push("Whop")
    sources.push(whop.source)
  }

  const source = reducePaymentsSource(sources)

  return {
    id: "payments",
    name: "Payment Processors",
    kind: "payments",
    state: procs.length > 0 ? "connected" : "not_configured",
    detail: paymentsDetail(procs, source),
    meta: { configured: procs.length },
    source,
  }
}

async function githubStatus(env: Record<string, string | undefined>): Promise<ConnectorStatus> {
  if (env.GITHUB_TOKEN || env.GH_TOKEN) {
    return {
      id: "github",
      name: "GitHub",
      kind: "developer",
      state: "connected",
      detail: "Configured via personal access token",
    }
  }
  try {
    const hasGh = await isBinaryPresent(memoizedExecFile, "gh")
    if (hasGh) {
      const { stdout } = await memoizedExecFile("gh", ["api", "user", "--jq", ".login"])
      const user = stdout.trim()
      if (user.length > 0) {
        return {
          id: "github",
          name: "GitHub",
          kind: "developer",
          state: "connected",
          detail: `Connected as @${user} via gh CLI`,
        }
      }
    }
  } catch {}
  return {
    id: "github",
    name: "GitHub",
    kind: "developer",
    state: "not_configured",
    detail: "Run `gh auth login` or set GITHUB_TOKEN in .env.local",
  }
}

async function claudeCodeStatus(env: Record<string, string | undefined>): Promise<ConnectorStatus> {
  const hasClaude = await isBinaryPresent(memoizedExecFile, "claude")
  const claudeAuth = await readClaudeAuthStatus()
  if (claudeAuth.loggedIn || (hasClaude && env.ANTHROPIC_API_KEY)) {
    return {
      id: "claude-code",
      name: "Claude Code",
      kind: "developer",
      state: "connected",
      detail: "Claude Code CLI authenticated and ready for autonomous runs",
    }
  }
  if (hasClaude) {
    return {
      id: "claude-code",
      name: "Claude Code",
      kind: "developer",
      state: "not_configured",
      detail: "Installed on PATH, sign-in required (`claude login`)",
    }
  }
  return {
    id: "claude-code",
    name: "Claude Code",
    kind: "developer",
    state: "not_configured",
    detail: "Not installed. Run `curl -fsSL https://claude.ai/install.sh | bash`",
  }
}

async function kiroStatus(): Promise<ConnectorStatus> {
  const hasKiro = await isBinaryPresent(memoizedExecFile, "kiro")
  const kiroAuth = await readKiroAuthStatus()
  if (kiroAuth.loggedIn) {
    return {
      id: "kiro",
      name: "Kiro",
      kind: "developer",
      state: "connected",
      detail: "Kiro CLI authenticated",
    }
  }
  if (hasKiro) {
    return {
      id: "kiro",
      name: "Kiro",
      kind: "developer",
      state: "not_configured",
      detail: "Installed on PATH",
    }
  }
  return {
    id: "kiro",
    name: "Kiro",
    kind: "developer",
    state: "not_configured",
    detail: "Not installed. Visit kiro.dev",
  }
}

async function codexStatus(): Promise<ConnectorStatus> {
  const hasCodex = await isBinaryPresent(memoizedExecFile, "codex")
  return {
    id: "codex",
    name: "Codex CLI",
    kind: "developer",
    state: hasCodex ? "connected" : "not_configured",
    detail: hasCodex ? "Codex CLI present on PATH" : "Not installed",
  }
}

async function kimiStatus(): Promise<ConnectorStatus> {
  const hasKimi = await isBinaryPresent(memoizedExecFile, "kimi")
  return {
    id: "kimi",
    name: "Kimi",
    kind: "developer",
    state: hasKimi ? "connected" : "not_configured",
    detail: hasKimi ? "Kimi CLI present on PATH" : "Not installed",
  }
}

async function antigravityStatus(env: Record<string, string | undefined>): Promise<ConnectorStatus> {
  const hasAgy = await isBinaryPresent(memoizedExecFile, "agy")
  const hasKey = Boolean(env.GEMINI_API_KEY)
  return {
    id: "antigravity",
    name: "Google Antigravity",
    kind: "orchestration",
    state: hasAgy || hasKey ? "connected" : "not_configured",
    detail: hasAgy ? "Antigravity CLI installed on PATH" : hasKey ? "Configured via GEMINI_API_KEY" : "Set GEMINI_API_KEY in .env.local",
  }
}

async function beeperStatus(): Promise<ConnectorStatus> {
  const hasBeeper = await isBinaryPresent(memoizedExecFile, "beeper")
  return {
    id: "beeper",
    name: "Beeper",
    kind: "social",
    state: hasBeeper ? "connected" : "not_configured",
    detail: hasBeeper ? "Local chat bridge active (--read-only)" : "Install via `brew install beeper`",
  }
}

async function googleStatus(): Promise<ConnectorStatus> {
  try {
    const accounts = await listGoogleAccounts(memoizedExecFile)
    if (accounts.length > 0) {
      return {
        id: "google",
        name: "Google Cloud & Workspace",
        kind: "email",
        state: "connected",
        detail: `Connected (${accounts.length} account(s): ${accounts.join(", ")})`,
        meta: { accounts: accounts.join(",") },
      }
    }
  } catch {}
  return {
    id: "google",
    name: "Google Cloud & Workspace",
    kind: "email",
    state: "not_configured",
    detail: "Run `brew install gogcli` and `gog auth login`",
  }
}

async function outlookStatus(): Promise<ConnectorStatus> {
  const status = await readOutlookStatus()
  return status.connected
    ? {
        id: "outlook",
        name: "Outlook",
        kind: "email",
        state: "connected",
        detail: status.account?.email ? `Connected as ${status.account.email}` : "Connected",
        meta: status.account?.email ? { accounts: status.account.email } : undefined,
      }
    : { id: "outlook", name: "Outlook", kind: "email", state: "not_configured", detail: "Sign in with Microsoft from the Connected tools page" }
}

const cachedStatuses = new Map<string, { at: number; promise: Promise<ConnectorStatus[]> }>()

export function clearConnectorStatusesCache(): void {
  cachedStatuses.clear()
}

/**
 * Every check here answers for the machine, except the four scoped ones
 * (payments, slack, notion, email) which resolve through `resolveCredential`
 * against `agentRootPath` — that company's own `.env` first, the machine
 * `.env.local` behind it. `agentRootPath: null` means machine-only, the
 * system Connections page's view.
 *
 * The cache is keyed by root path so one company's answers never leak into
 * another's — a single module-level slot would have served the first
 * company's statuses to everyone else.
 */
export async function allConnectorStatuses(
  agentRootPath: string | null,
  force = false
): Promise<ConnectorStatus[]> {
  const cacheKey = agentRootPath ?? "__machine__"
  const now = Date.now()
  const hit = cachedStatuses.get(cacheKey)
  if (!force && hit && now - hit.at < 15_000) {
    return hit.promise
  }

  const env = runtimeEnv()

  const checks: [string, ConnectorKind, () => Promise<ConnectorStatus>][] = [
    ["gbrain", "brain", brainStatus],
    ["claude-code", "developer", () => claudeCodeStatus(env)],
    ["google", "email", googleStatus],
    ["outlook", "email", outlookStatus],
    ["beeper", "social", beeperStatus],
    ["kiro", "developer", kiroStatus],
    ["kimi", "developer", kimiStatus],
    ["codex", "developer", codexStatus],
    ["antigravity", "orchestration", () => antigravityStatus(env)],
    ["llm", "orchestration", () => llmStatus(env)],
    ["whatsapp", "social", whatsappStatus],
    [
      "zernio",
      "social",
      async () => ({
        id: "zernio",
        name: "Zernio",
        kind: "social",
        state: env.ZERNIO_API_KEY ? "connected" : "not_configured",
        detail: env.ZERNIO_API_KEY ? "Zernio API key configured" : "Set ZERNIO_API_KEY in .env.local",
      }),
    ],
    [
      "beehiiv",
      "social",
      async () => ({
        id: "beehiiv",
        name: "beehiiv",
        kind: "social",
        state: env.BEEHIIV_API_KEY ? "connected" : "not_configured",
        detail: env.BEEHIIV_API_KEY ? "Newsletter publication active" : "Set BEEHIIV_API_KEY in .env.local",
      }),
    ],
    [
      "manychat",
      "social",
      async () => ({
        id: "manychat",
        name: "ManyChat",
        kind: "social",
        state: env.MANYCHAT_API_KEY ? "connected" : "not_configured",
        detail: env.MANYCHAT_API_KEY ? "Instagram DM automation active" : "Set MANYCHAT_API_KEY in .env.local",
      }),
    ],
    [
      "attio",
      "crm",
      async () => ({
        id: "attio",
        name: "Attio",
        kind: "crm",
        state: env.ATTIO_API_KEY ? "connected" : "not_configured",
        detail: env.ATTIO_API_KEY ? "CRM pipeline synchronized" : "Set ATTIO_API_KEY in .env.local",
      }),
    ],
    [
      "webinarjam",
      "crm",
      async () => ({
        id: "webinarjam",
        name: "WebinarJam",
        kind: "crm",
        state: env.WEBINARJAM_API_KEY ? "connected" : "not_configured",
        detail: env.WEBINARJAM_API_KEY ? "Webinar stream linked" : "Set WEBINARJAM_API_KEY in .env.local",
      }),
    ],
    [
      "trakyo",
      "crm",
      async () => ({
        id: "trakyo",
        name: "Trakyo",
        kind: "crm",
        state: env.TRAKYO_API_KEY ? "connected" : "not_configured",
        detail: env.TRAKYO_API_KEY ? "Attribution tracking enabled" : "Set TRAKYO_API_KEY in .env.local",
      }),
    ],
    [
      "meta-ads",
      "ads",
      async () => ({
        id: "meta-ads",
        name: "Meta Ads",
        kind: "ads",
        state: env.META_ADS_ACCESS_TOKEN ? "connected" : "not_configured",
        detail: env.META_ADS_ACCESS_TOKEN ? "Active campaign sync enabled" : "Set META_ADS_ACCESS_TOKEN in .env.local",
      }),
    ],
    [
      "ghl",
      "crm",
      async () => ({
        id: "ghl",
        name: "GoHighLevel",
        kind: "crm",
        state: env.GHL_API_KEY && env.GHL_LOCATION_ID ? "connected" : "not_configured",
        detail:
          env.GHL_API_KEY && env.GHL_LOCATION_ID
            ? "Location pipeline linked"
            : "Set GHL_API_KEY and GHL_LOCATION_ID in .env.local",
      }),
    ],
    [
      "arcads",
      "creative",
      async () => ({
        id: "arcads",
        name: "Arcads",
        kind: "creative",
        state: env.ARCADS_BASIC_AUTH ? "connected" : "not_configured",
        detail: env.ARCADS_BASIC_AUTH ? "AI video generation ready" : "Set ARCADS_BASIC_AUTH in .env.local",
      }),
    ],
    [
      "wispr",
      "local",
      async () => ({
        id: "wispr",
        name: "Wispr Flow",
        kind: "local",
        state: "not_configured",
        detail: "Local Wispr Flow app interface",
      }),
    ],
    [
      "local-stack",
      "local",
      async () => ({
        id: "local-stack",
        name: "Local Stack",
        kind: "local",
        state: "not_configured",
        detail: "Local AWS emulation stack",
      }),
    ],
    ["obsidian", "knowledge", obsidianStatus],
    [
      "miro",
      "creative",
      async () => ({
        id: "miro",
        name: "Miro",
        kind: "creative",
        state: env.MIRO_ACCESS_TOKEN ? "connected" : "not_configured",
        detail: env.MIRO_ACCESS_TOKEN ? "Boards API active" : "Set MIRO_ACCESS_TOKEN in .env.local",
      }),
    ],
    [
      "email",
      "email",
      async () => {
        const [inboxUser, inboxPass] = await Promise.all([
          resolveCredential(agentRootPath, "INBOX_1_USER"),
          resolveCredential(agentRootPath, "INBOX_1_PASS"),
        ])
        const inbox1Active = Boolean(inboxUser.value && inboxPass.value)
        const hasFallbackInbox = Boolean(env.INBOX_2_USER || env.GMAIL_USER || env.SMTP_USER)
        const hasEmail = Boolean(inbox1Active || hasFallbackInbox)
        const source = emailSource(inbox1Active ? inboxUser.source : null, hasFallbackInbox)
        const inboxes = [inbox1Active ? inboxUser.value : null, env.INBOX_2_USER].filter(Boolean).join(", ")
        return {
          id: "email",
          name: "Email (Gmail / IMAP)",
          kind: "email",
          state: hasEmail ? "connected" : "not_configured",
          detail: hasEmail
            ? `Inboxes active: ${inboxes}${source === "machine" ? " — machine default" : ""}`
            : "Set INBOX_1_USER and INBOX_1_PASS in .env.local",
          source,
        }
      },
    ],
    [
      "calendar",
      "calendar",
      async () => {
        const hasCal = Boolean(env.GOOGLE_CALENDAR_ID || env.GCAL_CLIENT_ID)
        return {
          id: "calendar",
          name: "Google Calendar",
          kind: "calendar",
          state: hasCal ? "connected" : "not_configured",
          detail: hasCal ? "Calendar sync active" : "Sign in via Google or set GOOGLE_CALENDAR_ID in .env.local",
        }
      },
    ],
    [
      "slack",
      "slack",
      async () => {
        const slack = await resolveCredential(agentRootPath, "SLACK_BOT_TOKEN")
        return {
          id: "slack",
          name: "Slack",
          kind: "slack",
          state: slack.value ? "connected" : "not_configured",
          detail: slack.value
            ? `Slack bot token active (channels & chat:write)${slack.source === "machine" ? " — machine default" : ""}`
            : "Set SLACK_BOT_TOKEN in .env.local",
          source: slack.source,
        }
      },
    ],
    ["payments", "payments", () => paymentsStatus(agentRootPath)],
    [
      "notion",
      "notion",
      async () => {
        const notion = await resolveCredential(agentRootPath, "NOTION_API_KEY")
        if (notion.value) {
          return {
            id: "notion",
            name: "Notion",
            kind: "notion",
            state: "connected",
            detail:
              notion.source === "machine"
                ? "Internal integration secret active — machine default"
                : "Internal integration secret active",
            source: notion.source,
          }
        }
        return {
          id: "notion",
          name: "Notion",
          kind: "notion",
          state: "not_configured",
          detail: "No Notion key for this company. Add one in Connections, or give this company its own.",
          source: notion.source,
        }
      },
    ],
    ["github", "developer", () => githubStatus(env)],
  ]

  const promise = (async () => {
    return Promise.all(
      checks.map(([id, kind, fn]) =>
        fn().catch(
          (err): ConnectorStatus => ({
            id,
            name: id,
            kind,
            state: "error",
            detail: err instanceof Error ? err.message : String(err),
          })
        )
      )
    )
  })()

  cachedStatuses.set(cacheKey, { at: now, promise })
  return promise
}
