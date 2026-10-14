import path from "node:path"
import type { Agent } from "./adapters/types"
import { companyOntologyExists } from "./company-ontology-exists"
import { getIntegrationStatus } from "./get-integration-status"
import { dailyTeamLogInstalled } from "./daily-team-log-installed"
import { getVendoredSkillsUpdate } from "./vendored-skills"
import { needsPortableAgentFile } from "./portable-agent-file"
import { needsPortableSkills } from "./portable-skills"
import { listPackState } from "./add-company-pack"
import { readGoogleAccounts } from "./google-accounts-config"
import { readMcpServers } from "./mcp-servers-config"
import { readMcpPool } from "./mcp-pool"
import { getAiExecutorIdForAgent } from "./ai-executor-registry"
import { resolveCredential } from "./credentials/resolve"
import { machineInboxOptions, readCompanyInboxSlot } from "./company-inbox"
import type { AvailablePack } from "@/components/add-pack-button"
import type { McpServer } from "./mcp-servers-config"
import type { CredentialSource } from "./credentials/resolve"

// The same bundled source createCompanyFromTemplate scaffolds from, read to
// tell a company whose vendored skills are behind the app's from one that is
// current (lib/vendored-skills.ts).
const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

/** The services a company can point at its own account instead of the
 *  machine default. Stripe/Slack/Notion, per the spec — the three that cost
 *  money or post somewhere on the company's behalf if inherited silently. */
const CREDENTIAL_ROWS: { key: string; label: string }[] = [
  { key: "STRIPE_SECRET_KEY", label: "Stripe" },
  { key: "SLACK_BOT_TOKEN", label: "Slack" },
  { key: "NOTION_API_KEY", label: "Notion" },
]

export type CredentialRowFlag = { credentialKey: string; label: string; source: CredentialSource }

/** Everything AgentCard needs that has to be read off the disk. */
export type AgentCardFlags = {
  showVerifyButton: boolean
  showDailyTeamLogButton: boolean
  removable: boolean
  showSetupCompanyButton: boolean
  showEditCompanyButton: boolean
  showBackupButton: boolean
  showOwnershipButton: boolean
  showVisibleRunOption: boolean
  integrationStatus: string
  showInstallDailyTeamLogButton: boolean
  skillsUpdate?: { installedTag: string | null; bundledTag: string }
  showPortableAgentFileButton: boolean
  showPortableSkillsButton: boolean
  availablePacks?: AvailablePack[]
  showOpenTerminalButton: boolean
  showGetStartedButton: boolean
  showRefreshOntologyButton: boolean
  showCheckMessagesButton: boolean
  showVoiceAssistantButton: boolean
  showGoogleAccountsPicker: boolean
  showAiExecutorPicker: boolean
  aiExecutorId?: string
  showMcpButton: boolean
  showCompanyGuide: boolean
  hasOntology: boolean
  mcpServers?: McpServer[]
  /** Every MCP server this MACHINE knows about — what the company picks from. */
  mcpPool?: McpServer[]
  googleAccounts?: string[]
  /** Stripe/Slack/Notion, resolved: machine default, this company's own, or unset. */
  credentialRows?: CredentialRowFlag[]
  /** This machine's inboxes, by slot and address — what the picker offers. */
  inboxOptions?: { slot: number; email: string }[]
  /** Which slot this company has chosen, or null for "not chosen yet". */
  inboxSlot?: number | null
}

/**
 * Extracted verbatim from app/page.tsx, which computed this inline while
 * mapping over every agent. It moved because v104 renders a card in two
 * places — the overview grid AND a single company's panel in the workspace —
 * and two copies of a thirteen-flag computation is exactly the pair that
 * drifts until one surface quietly offers a button the other doesn't.
 *
 * **The v66 property this preserves, and every future flag must too:** every
 * flag stays keyed to `isCommandSet`, and only `showOpenTerminalButton` ORs in
 * `isExternal`. That is what makes a new company feature default to OFF for a
 * folder the app doesn't manage, rather than needing to be excluded one at a
 * time as someone remembers.
 */
export async function getAgentCardFlags(
  agent: Agent,
  plhOpsExists: boolean
): Promise<AgentCardFlags> {
  const isAiCompanyStarterMain = agent.id === "ai-company-starter-main"
  const isPlhOps = agent.id === "plh-ops"
  const isRegisteredCompany = !["ai-company-starter-main", "plh-ops"].includes(agent.id)
  const isCommandSet = agent.kind === "command-set"
  // A folder the user added that follows none of this app's conventions.
  // Open in Terminal is the ONLY action it gets.
  const isExternal = agent.kind === "external"

  const showVisibleRunOption = isCommandSet
  const hasOntology = isCommandSet && (await companyOntologyExists(agent.rootPath))
  const needsCompanySetup = isCommandSet && !hasOntology
  const integrationStatus = await getIntegrationStatus(agent)
  const showInstallDailyTeamLogButton =
    plhOpsExists && isCommandSet && !(await dailyTeamLogInstalled(agent.rootPath))
  // Three small file reads, no subprocess (see lib/vendored-skills.ts).
  const skillsUpdate = isCommandSet
    ? ((await getVendoredSkillsUpdate(agent.rootPath, PACKS_ROOT)) ?? undefined)
    : undefined
  // Two stats, no subprocess (see lib/portable-agent-file.ts).
  const showPortableAgentFileButton = isCommandSet && (await needsPortableAgentFile(agent.rootPath))
  // A directory read and, for a company with no flat commands, a scan of its own skills (see lib/portable-skills.ts).
  const showPortableSkillsButton = isCommandSet && (await needsPortableSkills(agent.rootPath, PACKS_ROOT))
  const availablePacks = isCommandSet
    ? (await listPackState(agent.rootPath, PACKS_ROOT)).filter((p) => !p.installed)
    : undefined
  const googleAccounts = isCommandSet ? await readGoogleAccounts(agent.rootPath) : undefined
  // Kiro has a real per-project MCP scope and saveMcpServersImpl writes both
  // files, so this stays ungated on the executor rather than needing to be.
  const showMcpButton = isCommandSet
  const mcpServers = showMcpButton ? await readMcpServers(agent.rootPath) : undefined
  const mcpPool = showMcpButton ? await readMcpPool() : undefined
  const aiExecutorId = isCommandSet ? await getAiExecutorIdForAgent(agent.id) : undefined
  const credentialRows = isCommandSet
    ? await Promise.all(
        CREDENTIAL_ROWS.map(async ({ key, label }) => {
          const { source } = await resolveCredential(agent.rootPath, key)
          return { credentialKey: key, label, source }
        })
      )
    : undefined
  const inboxOptions = isCommandSet ? machineInboxOptions() : undefined
  const inboxSlot = isCommandSet ? await readCompanyInboxSlot(agent.rootPath) : undefined

  return {
    showVerifyButton: isAiCompanyStarterMain,
    showDailyTeamLogButton: isPlhOps,
    removable: isRegisteredCompany,
    showSetupCompanyButton: needsCompanySetup,
    showEditCompanyButton: hasOntology,
    showBackupButton: isCommandSet,
    showOwnershipButton: isCommandSet,
    showVisibleRunOption,
    integrationStatus,
    showInstallDailyTeamLogButton,
    skillsUpdate,
    showPortableAgentFileButton,
    showPortableSkillsButton,
    availablePacks,
    showOpenTerminalButton: showVisibleRunOption || isExternal,
    showGetStartedButton: showVisibleRunOption,
    showRefreshOntologyButton: hasOntology,
    // Not gated on hasOntology: reading chat needs no company description,
    // and a brand-new company is exactly the one whose Slack is worth reading.
    showCheckMessagesButton: isCommandSet,
    // Not Advanced-only, on the v106 precedent: a read-only Q&A voice/text
    // panel is gentler than a terminal, not more advanced than one, so it
    // ships to everyone the same way the in-app terminal dock does.
    showVoiceAssistantButton: isCommandSet,
    showGoogleAccountsPicker: isCommandSet,
    showAiExecutorPicker: isCommandSet,
    aiExecutorId,
    showMcpButton,
    showCompanyGuide: isCommandSet,
    hasOntology,
    mcpServers,
    mcpPool,
    googleAccounts,
    credentialRows,
    inboxOptions,
    inboxSlot,
  }
}
