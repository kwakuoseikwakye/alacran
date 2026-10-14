export const INTEGRATION_CATEGORIES = [
  "Productivity",
  "Communication",
  "CRM & Sales",
  "Developer",
  "Scheduling",
  "Finance",
  "Marketing",
  "Storage",
  "Knowledge",
  "AI & Automation",
  "Creative",
] as const

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number]

export type ConnectionMechanism = "cli" | "mcp" | "api-key"

export type Integration = {
  slug: string
  name: string
  tagline: string
  category: IntegrationCategory
  mechanism: ConnectionMechanism
  connectorId?: string
  popular?: boolean
  envKeys?: string[]
  mcpUrl?: string
}

export const INTEGRATIONS: Integration[] = [
  // Communication
  { slug: "beeper", name: "Beeper", tagline: "Your chats in one place: WhatsApp, iMessage, Signal, Telegram and more", category: "Communication", mechanism: "cli", connectorId: "beeper", popular: true, envKeys: [] },
  { slug: "slack", name: "Slack Bot", tagline: "Channels, notifications & chat:write", category: "Communication", mechanism: "api-key", connectorId: "slack", popular: true, envKeys: ["SLACK_BOT_TOKEN"] },
  { slug: "whatsapp", name: "WhatsApp", tagline: "Bridged via Beeper local chat bridge", category: "Communication", mechanism: "cli", connectorId: "whatsapp", envKeys: [] },
  { slug: "discord", name: "Discord", tagline: "Community servers & webhook bots", category: "Communication", mechanism: "api-key" },
  { slug: "telegram", name: "Telegram", tagline: "Channel broadcasts & bot API", category: "Communication", mechanism: "api-key" },
  { slug: "zoom", name: "Zoom", tagline: "Meeting scheduling & cloud recordings", category: "Communication", mechanism: "api-key", popular: true },
  { slug: "manychat", name: "ManyChat", tagline: "Instagram DM automation & flows", category: "Communication", mechanism: "api-key", connectorId: "manychat", envKeys: ["MANYCHAT_API_KEY"] },

  // Productivity
  { slug: "google", name: "Google Cloud & Workspace", tagline: "Gmail, Calendar and Drive", category: "Productivity", mechanism: "cli", connectorId: "google", popular: true, envKeys: [] },
  { slug: "outlook", name: "Outlook", tagline: "Mail and calendar from Outlook.com and Microsoft 365, for every AI", category: "Productivity", mechanism: "cli", connectorId: "outlook", popular: true, envKeys: [] },
  { slug: "notion", name: "Notion", tagline: "Docs, wikis & database sync", category: "Productivity", mechanism: "api-key", connectorId: "notion", popular: true, envKeys: ["NOTION_API_KEY"] },
  { slug: "airtable", name: "Airtable", tagline: "Relational bases & records", category: "Productivity", mechanism: "api-key", popular: true },
  { slug: "clickup", name: "ClickUp", tagline: "Workspace tasks, docs & goals", category: "Productivity", mechanism: "api-key" },
  { slug: "trello", name: "Trello", tagline: "Kanban boards & cards", category: "Productivity", mechanism: "api-key" },
  { slug: "coda", name: "Coda", tagline: "Interactive documents & formulas", category: "Productivity", mechanism: "api-key" },

  // CRM & Sales
  { slug: "attio", name: "Attio", tagline: "Modern CRM built on realtime data", category: "CRM & Sales", mechanism: "api-key", connectorId: "attio", popular: true, envKeys: ["ATTIO_API_KEY"] },
  { slug: "hubspot", name: "HubSpot", tagline: "Inbound CRM, marketing & deals", category: "CRM & Sales", mechanism: "api-key", popular: true },
  { slug: "salesforce", name: "Salesforce", tagline: "Enterprise accounts & pipeline", category: "CRM & Sales", mechanism: "api-key" },
  { slug: "gohighlevel", name: "GoHighLevel", tagline: "Agency pipelines & client contacts", category: "CRM & Sales", mechanism: "api-key", connectorId: "ghl", envKeys: ["GHL_API_KEY", "GHL_LOCATION_ID"] },
  { slug: "zendesk", name: "Zendesk", tagline: "Customer support tickets", category: "CRM & Sales", mechanism: "api-key" },
  { slug: "intercom", name: "Intercom", tagline: "Product tours & live support", category: "CRM & Sales", mechanism: "api-key" },

  // Developer
  { slug: "github", name: "GitHub", tagline: "Repos, pull requests & issues via gh CLI", category: "Developer", mechanism: "cli", connectorId: "github", popular: true, envKeys: ["GITHUB_TOKEN"] },
  { slug: "vercel", name: "Vercel", tagline: "Deployments & domains via Vercel MCP", category: "Developer", mechanism: "mcp", popular: true, mcpUrl: "https://mcp.vercel.com" },
  // Linear and Sentry were listed here as mechanism "mcp" with no mcpUrl, so the
  // setup modal invented https://mcp.linear.com/mcp and https://mcp.sentry.com/mcp,
  // wrote them into the company's .mcp.json and reported success. Removed rather
  // than guessed at: an endpoint nobody verified is a host somebody else can
  // register, and an MCP server serves tool definitions to the agent.
  //
  // To add either back: run the DCR pair documented in lib/mcp-presets.ts against
  // the real endpoint, then declare mcpUrl. catalog.test.ts fails on an MCP entry
  // without one, so this cannot regress silently.
  { slug: "jira", name: "Jira", tagline: "Engineering sprint boards", category: "Developer", mechanism: "api-key" },
  { slug: "gitlab", name: "GitLab", tagline: "DevOps pipelines & repos", category: "Developer", mechanism: "api-key" },

  // Scheduling
  { slug: "calendly", name: "Calendly", tagline: "Customer booking & scheduling links", category: "Scheduling", mechanism: "api-key", popular: true },
  { slug: "caldotcom", name: "Cal.com", tagline: "Open source calendar scheduling", category: "Scheduling", mechanism: "api-key" },

  // Finance
  { slug: "stripe", name: "Stripe", tagline: "Payments, subscriptions & checkout", category: "Finance", mechanism: "api-key", connectorId: "payments", popular: true, envKeys: ["STRIPE_SECRET_KEY"] },
  { slug: "freee", name: "freee", tagline: "Cloud accounting & invoicing via freee MCP", category: "Finance", mechanism: "mcp", mcpUrl: "https://mcp.freee.co.jp/mcp" },
  { slug: "quickbooks", name: "QuickBooks", tagline: "Small business bookkeeping & P&L", category: "Finance", mechanism: "api-key" },
  { slug: "xero", name: "Xero", tagline: "Bank feeds & bill management", category: "Finance", mechanism: "api-key" },
  { slug: "paypal", name: "PayPal", tagline: "Merchant payments & payouts", category: "Finance", mechanism: "api-key", envKeys: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] },
  { slug: "wise", name: "Wise", tagline: "Multi-currency business balances", category: "Finance", mechanism: "api-key" },
  { slug: "plaid", name: "Plaid", tagline: "Bank account authorization", category: "Finance", mechanism: "api-key" },

  // Marketing
  { slug: "beehiiv", name: "beehiiv", tagline: "Newsletter publication & subscriber growth", category: "Marketing", mechanism: "api-key", connectorId: "beehiiv", popular: true, envKeys: ["BEEHIIV_API_KEY"] },
  { slug: "meta", name: "Meta Ads", tagline: "Campaigns & ad audience sync", category: "Marketing", mechanism: "api-key", connectorId: "meta-ads", envKeys: ["META_ADS_ACCESS_TOKEN"] },
  { slug: "mailchimp", name: "Mailchimp", tagline: "Email lists & automated journeys", category: "Marketing", mechanism: "api-key" },
  { slug: "googleanalytics", name: "Google Analytics", tagline: "Web traffic & conversion tracking", category: "Marketing", mechanism: "api-key" },
  { slug: "buffer", name: "Buffer", tagline: "Social post scheduling buffer", category: "Marketing", mechanism: "api-key" },
  { slug: "hootsuite", name: "Hootsuite", tagline: "Multi-network social broadcasting", category: "Marketing", mechanism: "api-key" },
  { slug: "zernio", name: "Zernio", tagline: "Automated distribution engine", category: "Marketing", mechanism: "api-key", connectorId: "zernio", envKeys: ["ZERNIO_API_KEY"] },
  { slug: "webinarjam", name: "WebinarJam", tagline: "Webinar broadcasting & attendees", category: "Marketing", mechanism: "api-key", connectorId: "webinarjam", envKeys: ["WEBINARJAM_API_KEY"] },
  { slug: "trakyo", name: "Trakyo", tagline: "Organic marketing attribution", category: "Marketing", mechanism: "api-key", connectorId: "trakyo", envKeys: ["TRAKYO_API_KEY"] },

  // Storage
  { slug: "dropbox", name: "Dropbox", tagline: "Cloud file sync & team folders", category: "Storage", mechanism: "api-key" },
  { slug: "box", name: "Box", tagline: "Secure enterprise document storage", category: "Storage", mechanism: "api-key" },
  { slug: "onedrive", name: "OneDrive", tagline: "Microsoft cloud drive & files", category: "Storage", mechanism: "api-key" },

  // Knowledge
  { slug: "gbrain", name: "G-Brain", tagline: "What Alacrán remembers about your company", category: "Knowledge", mechanism: "cli", connectorId: "gbrain", popular: true, envKeys: [] },
  { slug: "obsidian", name: "Notes Vault", tagline: "Local markdown knowledge base", category: "Knowledge", mechanism: "cli", connectorId: "obsidian", envKeys: [] },

  // AI & Automation
  { slug: "claude-code", name: "Claude Code", tagline: "The AI that does the work in Alacrán", category: "AI & Automation", mechanism: "cli", connectorId: "claude-code", popular: true, envKeys: ["ANTHROPIC_API_KEY"] },
  { slug: "antigravity", name: "Google Antigravity", tagline: "Google's AI assistant, as an alternative to Claude", category: "AI & Automation", mechanism: "cli", connectorId: "antigravity", popular: true, envKeys: ["GEMINI_API_KEY"] },
  { slug: "kiro", name: "Kiro", tagline: "AWS terminal companion & code assistant", category: "AI & Automation", mechanism: "cli", connectorId: "kiro" },
  { slug: "kimi", name: "Kimi", tagline: "Moonshot AI high-context terminal CLI", category: "AI & Automation", mechanism: "cli", connectorId: "kimi" },
  { slug: "codex", name: "Codex CLI", tagline: "OpenAI agentic CLI for local engineering", category: "AI & Automation", mechanism: "cli", connectorId: "codex", envKeys: ["OPENAI_API_KEY"] },
  { slug: "anthropic", name: "Anthropic", tagline: "Direct Claude foundation models API", category: "AI & Automation", mechanism: "api-key", popular: true },
  { slug: "openai", name: "OpenAI", tagline: "GPT-4o models & embeddings API", category: "AI & Automation", mechanism: "api-key" },
  { slug: "zapier", name: "Zapier", tagline: "Cross-app webhook triggers", category: "AI & Automation", mechanism: "api-key" },
  { slug: "make", name: "Make", tagline: "Visual scenario automation", category: "AI & Automation", mechanism: "api-key" },
  { slug: "n8n", name: "n8n", tagline: "Self-hosted workflow automations", category: "AI & Automation", mechanism: "api-key" },

  // Creative
  { slug: "figma", name: "Figma", tagline: "Design tokens & prototypes via Figma MCP", category: "Creative", mechanism: "mcp", popular: true, mcpUrl: "https://mcp.figma.com/mcp" },
  { slug: "canva", name: "Canva", tagline: "Graphics, decks & media via Canva MCP", category: "Creative", mechanism: "mcp", mcpUrl: "https://mcp.canva.com/mcp" },
  { slug: "lovable", name: "Lovable", tagline: "Fullstack web apps via Lovable MCP", category: "Creative", mechanism: "mcp", mcpUrl: "https://mcp.lovable.dev" },
  { slug: "docusign", name: "Docusign", tagline: "Contracts & e-signatures via Docusign MCP", category: "Creative", mechanism: "mcp", mcpUrl: "https://mcp.docusign.com/mcp" },
  { slug: "miro", name: "Miro", tagline: "Visual whiteboards & team diagrams", category: "Creative", mechanism: "api-key", connectorId: "miro", envKeys: ["MIRO_ACCESS_TOKEN"] },
  { slug: "arcads", name: "Arcads", tagline: "AI generative video advertising", category: "Creative", mechanism: "api-key", connectorId: "arcads", envKeys: ["ARCADS_BASIC_AUTH"] },
  { slug: "loom", name: "Loom", tagline: "Asynchronous screen recordings", category: "Creative", mechanism: "api-key" },
  { slug: "typeform", name: "Typeform", tagline: "Interactive forms & questionnaires", category: "Creative", mechanism: "api-key" },
]

export type CatalogEntry = Integration & { connected: boolean; keySaved: boolean }

/**
 * The env var names the connect flow may write for an entry.
 * Explicit envKeys win; for MCP servers, returns [] since MCP connects via .mcp.json.
 * For API-key tools without declared keys, defaults to <SLUG>_API_KEY.
 */
export function connectKeysFor(entry: Integration): string[] {
  if (entry.mechanism === "mcp") return []
  if (entry.envKeys) return entry.envKeys
  return [`${entry.slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`]
}

/**
 * Catalog grouped by category, in canonical category order.
 */
export function integrationsByCategory(
  entries: Integration[] = INTEGRATIONS
): Map<IntegrationCategory, Integration[]> {
  const out = new Map<IntegrationCategory, Integration[]>()
  for (const cat of INTEGRATION_CATEGORIES) {
    const tools = entries.filter((i) => i.category === cat)
    if (tools.length) out.set(cat, tools)
  }
  return out
}

/**
 * Filter integrations by connection mechanism.
 */
export function integrationsByMechanism(
  mechanism: ConnectionMechanism,
  entries: Integration[] = INTEGRATIONS
): Integration[] {
  return entries.filter((i) => i.mechanism === mechanism)
}

/**
 * Merge live connector state onto the catalog.
 * - connected is true when a linked connector reports 'connected' OR an MCP server is configured in .mcp.json.
 * - keySaved means all connect-flow keys sit in .env.local.
 */
export function connectionCatalog(
  statuses: Array<{ id: string; state?: string; status?: string; detail?: string }>,
  savedEnv: Record<string, string> = {},
  mcpServers: Array<{ name: string; url?: string }> = []
): CatalogEntry[] {
  const byId = new Map(statuses.map((s) => [s.id, s]))
  const mcpNames = new Set(mcpServers.map((s) => s.name.toLowerCase()))

  return INTEGRATIONS.map((i) => {
    const keys = connectKeysFor(i)
    const st = i.connectorId ? byId.get(i.connectorId) : undefined
    let isConn = st ? (st.state ?? st.status) === "connected" : false

    if (i.mechanism === "mcp") {
      isConn = isConn || mcpNames.has(i.slug.toLowerCase())
    }

    const saved = keys.length > 0 && keys.every((k) => Boolean(savedEnv[k]))
    // Nothing tests a pasted key against its vendor — an API-key connector's
    // "connected" only means a non-empty string exists. A typo'd, revoked and
    // working key all looked identical under a green "Connected", so the most
    // an API-key tool can say is "Key saved".
    if (i.mechanism === "api-key") {
      return { ...i, connected: false, keySaved: saved || isConn }
    }

    return {
      ...i,
      connected: isConn,
      keySaved: saved,
    }
  })
}
