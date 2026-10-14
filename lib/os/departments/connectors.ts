import { memoizedExecFile } from "@/lib/exec-memo"
import { isBinaryPresent } from "@/lib/binary-present"
import { stat } from "node:fs/promises"
import path from "node:path"

export type ConnectorStatus = "connected" | "not_configured" | "error"

export type DepartmentConnector = {
  id: string
  label: string
  status: ConnectorStatus
  detail?: string
  /** Where a detected connection's key lives. A machine-wide key is not this
   *  company's account, and a screen must not present it as one. */
  source?: "company" | "machine"
}

export type ConnectorTreatment = {
  badgeClass: string
  dotClass: string
  isGreen: boolean
  labelSuffix?: string
}

export type ExecProbeFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

const defaultExecFn: ExecProbeFn = (cmd, args) => memoizedExecFile(cmd, args)

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function hasCompanySecret(companyPath: string, connectorId: string): Promise<boolean> {
  return (
    (await fileExists(path.join(companyPath, "secrets", `${connectorId}.txt`))) ||
    (await fileExists(path.join(companyPath, "secrets", `${connectorId}.key`))) ||
    (await fileExists(path.join(companyPath, "secrets", `${connectorId}.env`)))
  )
}

/**
 * Strict presentation treatment for connector statuses.
 * Invariant per spec: no state renders as green unless it is "connected".
 */
export function getConnectorTreatment(status: ConnectorStatus): ConnectorTreatment {
  switch (status) {
    case "connected":
      return {
        badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        dotClass: "bg-emerald-500",
        isGreen: true,
      }
    case "error":
      return {
        badgeClass: "border-red-500/30 bg-red-500/10 text-red-400",
        dotClass: "bg-red-500",
        isGreen: false,
        labelSuffix: "(error)",
      }
    case "not_configured":
    default:
      return {
        badgeClass: "border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground",
        dotClass: "bg-muted-foreground/50",
        isGreen: false,
        labelSuffix: "(setup)",
      }
  }
}

/**
 * Dynamically resolves the health and connection status of a department connector
 * against machine credentials, CLI tools, company secrets, and environment variables.
 * Invariant: Never fake green — only returns "connected" if credentials or an active CLI session really exist.
 */
export async function resolveConnectorStatus(
  connectorId: string,
  options?: {
    companyPath?: string
    env?: NodeJS.ProcessEnv
    execFn?: ExecProbeFn
  }
): Promise<ConnectorStatus> {
  const env = options?.env ?? process.env
  const execFn = options?.execFn ?? defaultExecFn
  const companyPath = options?.companyPath

  // 1. Check local company secrets directory if companyPath is provided
  if (companyPath && (await hasCompanySecret(companyPath, connectorId))) {
    return "connected"
  }

  // 2. Specific connector credential probes
  switch (connectorId) {
    case "github": {
      if (env.GITHUB_TOKEN || env.GH_TOKEN) return "connected"
      try {
        const hasGh = await isBinaryPresent(execFn, "gh")
        if (!hasGh) return "not_configured"
        const { stdout } = await execFn("gh", ["api", "user", "--jq", ".login"])
        return stdout.trim().length > 0 ? "connected" : "not_configured"
      } catch {
        return "not_configured"
      }
    }

    case "beeper": {
      try {
        const hasBeeper = await isBinaryPresent(execFn, "beeper")
        if (!hasBeeper) return "not_configured"
        await execFn("beeper", ["--read-only", "version"])
        return "connected"
      } catch {
        return "not_configured"
      }
    }

    case "stripe": {
      if (env.STRIPE_API_KEY || env.STRIPE_SECRET_KEY) return "connected"
      try {
        const hasStripe = await isBinaryPresent(execFn, "stripe")
        if (!hasStripe) return "not_configured"
        const { stdout } = await execFn("stripe", ["config", "--list"])
        return stdout.includes("live_api_key") || stdout.includes("test_api_key")
          ? "connected"
          : "not_configured"
      } catch {
        return "not_configured"
      }
    }

    case "attio": {
      return env.ATTIO_API_KEY || env.ATTIO_TOKEN ? "connected" : "not_configured"
    }

    case "hubspot": {
      return env.HUBSPOT_ACCESS_TOKEN || env.HUBSPOT_API_KEY ? "connected" : "not_configured"
    }

    case "mercury": {
      return env.MERCURY_API_KEY || env.MERCURY_TOKEN ? "connected" : "not_configured"
    }

    case "quickbooks": {
      return env.QUICKBOOKS_ACCESS_TOKEN || env.QUICKBOOKS_TOKEN ? "connected" : "not_configured"
    }

    case "ghost": {
      return env.GHOST_ADMIN_API_KEY || env.GHOST_API_KEY ? "connected" : "not_configured"
    }

    case "substack": {
      return env.SUBSTACK_API_KEY || env.SUBSTACK_SID ? "connected" : "not_configured"
    }

    case "x": {
      return env.TWITTER_BEARER_TOKEN || env.X_BEARER_TOKEN || env.X_API_KEY
        ? "connected"
        : "not_configured"
    }

    case "linkedin": {
      return env.LINKEDIN_ACCESS_TOKEN || env.LINKEDIN_TOKEN ? "connected" : "not_configured"
    }

    case "youtube": {
      return env.YOUTUBE_API_KEY || env.GOOGLE_API_KEY ? "connected" : "not_configured"
    }

    case "bluesky": {
      return env.BLUESKY_PASSWORD || env.BLUESKY_APP_PASSWORD ? "connected" : "not_configured"
    }

    case "notion": {
      return env.NOTION_TOKEN || env.NOTION_API_KEY ? "connected" : "not_configured"
    }

    default:
      return "not_configured"
  }
}

/**
 * Resolve an array of declared department connectors with real-time connection status.
 */
export async function resolveDepartmentConnectors(
  declared: { id: string; label: string; status?: ConnectorStatus }[],
  options?: {
    companyPath?: string
    env?: NodeJS.ProcessEnv
    execFn?: ExecProbeFn
  }
): Promise<DepartmentConnector[]> {
  return Promise.all(
    declared.map(async (c) => {
      const detected = await resolveConnectorStatus(c.id, options)
      const resolved: DepartmentConnector = {
        id: c.id,
        label: c.label,
        status: detected !== "not_configured" ? detected : c.status ?? "not_configured",
      }
      if (detected === "connected") {
        const own = options?.companyPath ? await hasCompanySecret(options.companyPath, c.id) : false
        resolved.source = own ? "company" : "machine"
      }
      return resolved
    })
  )
}

export type DepartmentId = "funnel" | "finances" | "social" | "content"

export type DepartmentConnectorCategory = "crm" | "finance" | "social" | "content"

export type DepartmentConnectorDefinition = {
  id: string
  name: string
  category: DepartmentConnectorCategory
  categoryLabel: string
  departments: DepartmentId[]
  description: string
  docsUrl: string
  envVar: string
  secretFile: string
  cliCommand?: string
  cliBinary?: string
}

export type ConnectedCompanyInfo = {
  companyId: string
  companyName: string
  connected: boolean
}

export type ResolvedDepartmentConnector = DepartmentConnectorDefinition & {
  status: ConnectorStatus
  detail: string
  companies?: ConnectedCompanyInfo[]
}

export const DEPARTMENT_CONNECTOR_CATALOG: DepartmentConnectorDefinition[] = [
  {
    id: "attio",
    name: "Attio",
    category: "crm",
    categoryLabel: "CRM & Sales",
    departments: ["funnel"],
    description: "Sync contacts, accounts, and deal stages into pipeline records.",
    docsUrl: "https://attio.com",
    envVar: "ATTIO_API_KEY",
    secretFile: "secrets/attio.txt",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    categoryLabel: "CRM & Sales",
    departments: ["funnel"],
    description: "Sync leads, companies, and deals from HubSpot CRM.",
    docsUrl: "https://developers.hubspot.com",
    envVar: "HUBSPOT_ACCESS_TOKEN",
    secretFile: "secrets/hubspot.txt",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "finance",
    categoryLabel: "Finances & Billing",
    departments: ["finances", "funnel"],
    description: "Sync payment charges, subscriptions, balances, and customer payouts.",
    docsUrl: "https://stripe.com/docs/stripe-cli",
    envVar: "STRIPE_API_KEY",
    secretFile: "secrets/stripe.txt",
    cliCommand: "stripe login",
    cliBinary: "stripe",
  },
  {
    id: "mercury",
    name: "Mercury",
    category: "finance",
    categoryLabel: "Finances & Billing",
    departments: ["finances"],
    description: "Sync bank accounts, daily treasury balances, and wire transfers.",
    docsUrl: "https://mercury.com",
    envVar: "MERCURY_API_KEY",
    secretFile: "secrets/mercury.txt",
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    category: "finance",
    categoryLabel: "Finances & Billing",
    departments: ["finances"],
    description: "Sync accounting ledger, invoices, bills, and tax categories.",
    docsUrl: "https://quickbooks.intuit.com",
    envVar: "QUICKBOOKS_ACCESS_TOKEN",
    secretFile: "secrets/quickbooks.txt",
  },
  {
    id: "x",
    name: "X (Twitter)",
    category: "social",
    categoryLabel: "Social & Audience",
    departments: ["social"],
    description: "Sync follower counts, impressions, and engagement snapshots.",
    docsUrl: "https://developer.x.com",
    envVar: "X_BEARER_TOKEN",
    secretFile: "secrets/x.txt",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "social",
    categoryLabel: "Social & Audience",
    departments: ["social"],
    description: "Sync company page followers, analytics, and update impressions.",
    docsUrl: "https://developer.linkedin.com",
    envVar: "LINKEDIN_ACCESS_TOKEN",
    secretFile: "secrets/linkedin.txt",
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "social",
    categoryLabel: "Social & Audience",
    departments: ["social"],
    description: "Sync channel subscribers, views, video library, and watch analytics.",
    docsUrl: "https://developers.google.com/youtube/v3",
    envVar: "YOUTUBE_API_KEY",
    secretFile: "secrets/youtube.txt",
  },
  {
    id: "bluesky",
    name: "Bluesky",
    category: "social",
    categoryLabel: "Social & Audience",
    departments: ["social"],
    description: "Sync AT Protocol followers, profile metrics, and engagement.",
    docsUrl: "https://atproto.com",
    envVar: "BLUESKY_APP_PASSWORD",
    secretFile: "secrets/bluesky.txt",
  },
  {
    id: "ghost",
    name: "Ghost / Blog",
    category: "content",
    categoryLabel: "Content & Publishing",
    departments: ["content"],
    description: "Sync published blog posts, newsletters, and publication drafts.",
    docsUrl: "https://ghost.org/docs/admin-api/",
    envVar: "GHOST_ADMIN_API_KEY",
    secretFile: "secrets/ghost.txt",
  },
  {
    id: "substack",
    name: "Substack",
    category: "content",
    categoryLabel: "Content & Publishing",
    departments: ["content"],
    description: "Sync newsletter articles, published posts, and subscriber counts.",
    docsUrl: "https://substack.com",
    envVar: "SUBSTACK_API_KEY",
    secretFile: "secrets/substack.txt",
  },
]

export async function resolveAllDepartmentConnectors(options?: {
  companyPath?: string
  companies?: Array<{ id: string; name: string; rootPath: string }>
  env?: NodeJS.ProcessEnv
  execFn?: ExecProbeFn
}): Promise<ResolvedDepartmentConnector[]> {
  const companies = options?.companies ?? []

  return Promise.all(
    DEPARTMENT_CONNECTOR_CATALOG.map(async (connector) => {
      // 1. Check machine-level status (env vars, global CLI, or specific companyPath if passed)
      const machineStatus = await resolveConnectorStatus(connector.id, {
        companyPath: options?.companyPath,
        env: options?.env,
        execFn: options?.execFn,
      })

      // 2. If companies list provided, check per-company status
      let connectedCompanies: ConnectedCompanyInfo[] | undefined
      let anyCompanyConnected = false

      if (companies.length > 0) {
        connectedCompanies = await Promise.all(
          companies.map(async (company) => {
            const hasSecret = await hasCompanySecret(company.rootPath, connector.id)
            if (hasSecret) anyCompanyConnected = true
            return {
              companyId: company.id,
              companyName: company.name,
              connected: hasSecret,
            }
          })
        )
      }

      // 3. Synthesize status and detail
      let status: ConnectorStatus = "not_configured"
      let detail = `Not configured yet. Connect via ${connector.envVar} or ${connector.secretFile}.`

      if (machineStatus === "connected") {
        status = "connected"
        detail = connector.cliCommand
          ? `Connected via ${connector.cliBinary || "CLI"} / environment.`
          : `Connected via ${connector.envVar} environment variable.`
      } else if (anyCompanyConnected && connectedCompanies) {
        status = "connected"
        const connectedCount = connectedCompanies.filter((c) => c.connected).length
        detail = `Connected for ${connectedCount} of ${connectedCompanies.length} companies.`
      }

      return {
        ...connector,
        status,
        detail,
        companies: connectedCompanies,
      }
    })
  )
}
