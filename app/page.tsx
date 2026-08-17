import os from "node:os"
import path from "node:path"
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { AgentCard } from "@/components/agent-card"
import { ReorderableGrid } from "@/components/reorderable-grid"
import { AddCompanyForm } from "@/components/add-company-form"
import { getAvatars } from "@/lib/avatars-registry"
import { companyOntologyExists } from "@/lib/company-ontology-exists"
import { getIntegrationStatus } from "@/lib/get-integration-status"
import { dailyTeamLogInstalled } from "@/lib/daily-team-log-installed"
import { getVendoredSkillsUpdate } from "@/lib/vendored-skills"
import { OnboardingWelcome } from "@/components/onboarding-welcome"
import { getAiExecutorIdForAgent } from "@/lib/ai-executor-registry"
import { listGoogleAccountEmails } from "@/lib/google-accounts"
import { readGoogleAccounts } from "@/lib/google-accounts-config"
import { readMcpServers } from "@/lib/mcp-servers-config"

export const dynamic = "force-dynamic"

// Same bundled source createCompanyFromTemplate scaffolds from, read here to
// tell a company whose vendored skills are behind the app's from one that is
// current (lib/vendored-skills.ts).
const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

export default async function AgentTreePage() {
  const homeDir = os.homedir()
  const [agents, adapters, avatars] = await Promise.all([
    getEffectiveAgents(),
    getEffectiveAdapters(),
    getAvatars(),
  ])
  if (agents.length === 0) {
    return (
      <div className="dash-content">
        <OnboardingWelcome homeDir={homeDir} />
      </div>
    )
  }

  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))
  const plhOpsSource = agents.find((agent) => agent.id === "plh-ops")

  const [results, availableGoogleAccounts] = await Promise.all([
    getAllActivities(agents, adapters),
    listGoogleAccountEmails(),
  ])

  return (
    <>
      {/* Page header */}
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">Your machine</p>
          <h1>Agents</h1>
          <p>Status and quick actions for every managed agent on this computer.</p>
        </div>
        <div className="mt-1">
          <AddCompanyForm homeDir={homeDir} />
        </div>
      </header>

      {/* Bento grid of agent cards */}
      <div className="dash-content">
        <ReorderableGrid
          items={await Promise.all(
            results.map(async (result, index) => {
              const latest = mergeAndSortActivities([result])[0] ?? null
              const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
              const isPlhOps = result.agent.id === "plh-ops"
              const isRegisteredCompany = !["ai-company-starter-main", "plh-ops"].includes(result.agent.id)
              const isCommandSet = result.agent.kind === "command-set"
              // A folder the user added that follows none of this app's
              // conventions. Open in Terminal is the ONLY action it gets —
              // every other flag below stays keyed to isCommandSet, so a new
              // company feature is off for it by default rather than needing
              // to be excluded one at a time.
              const isExternal = result.agent.kind === "external"
              // Both features open a real terminal window which is supported on macOS
              // and Linux (see lib/terminal-launch-command.ts); if neither
              // finds an actual terminal emulator installed, the action itself
              // reports that rather than hiding the button pre-emptively.
              const showVisibleRunOption = isCommandSet
              const hasOntology = isCommandSet && (await companyOntologyExists(result.agent.rootPath))
              const needsCompanySetup = isCommandSet && !hasOntology
              const integrationStatus = await getIntegrationStatus(result.agent)
              const showInstallDailyTeamLogButton =
                Boolean(plhOpsSource) &&
                result.agent.kind === "command-set" &&
                !(await dailyTeamLogInstalled(result.agent.rootPath))
              // Three small file reads, no subprocess (see lib/vendored-skills.ts).
              const skillsUpdate = isCommandSet
                ? ((await getVendoredSkillsUpdate(result.agent.rootPath, PACKS_ROOT)) ?? undefined)
                : undefined
              const aiExecutorId = isCommandSet ? await getAiExecutorIdForAgent(result.agent.id) : undefined
              const googleAccounts = isCommandSet ? await readGoogleAccounts(result.agent.rootPath) : undefined
              // Claude Code is the only executor with per-project MCP config:
              // `codex mcp add` has no scope flag (machine-global
              // ~/.codex/config.toml only) and neither Aider nor Antigravity CLI
              // has MCP at all.
              const showMcpButton = isCommandSet && aiExecutorId === "claude-code"
              const mcpServers = showMcpButton ? await readMcpServers(result.agent.rootPath) : undefined
              return {
                id: result.agent.id,
                node: (
                  <AgentCard
                    agent={result.agent}
                    latestActivity={latest}
                    error={result.error}
                    showVerifyButton={isAiCompanyStarterMain}
                    showDailyTeamLogButton={isPlhOps}
                    removable={isRegisteredCompany}
                    avatarUrl={avatarByAgentId[result.agent.id] ?? null}
                    showSetupCompanyButton={needsCompanySetup}
                    showEditCompanyButton={hasOntology}
                    showBackupButton={isCommandSet}
                    showOwnershipButton={isCommandSet}
                    showVisibleRunOption={showVisibleRunOption}
                    integrationStatus={integrationStatus}
                    showInstallDailyTeamLogButton={showInstallDailyTeamLogButton}
                    skillsUpdate={skillsUpdate}
                    showOpenTerminalButton={showVisibleRunOption || isExternal}
                    showGetStartedButton={showVisibleRunOption}
                    showAiExecutorPicker={isCommandSet}
                    showGoogleAccountsPicker={isCommandSet}
                    showMcpButton={showMcpButton}
                    showCompanyGuide={isCommandSet}
                    hasOntology={hasOntology}
                    aiExecutorId={aiExecutorId}
                    mcpServers={mcpServers}
                    googleAccounts={googleAccounts}
                    availableGoogleAccounts={availableGoogleAccounts}
                    index={index}
                  />
                ),
              }
            })
          )}
        />
      </div>
    </>
  )
}
