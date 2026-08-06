import fs from "node:fs"
import { PIPELINE_LAUNCHD_LABEL } from "@/lib/config"
import { PIPELINE_LAUNCHD_PLIST_PATH } from "@/lib/scheduled-job/paths"
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { checkLaunchdJob } from "@/lib/adapters/launchd"
import { checkPollLockStatus } from "@/lib/adapters/poll-lock"
import { AgentCard } from "@/components/agent-card"
import { AddCompanyForm } from "@/components/add-company-form"
import { getAvatars } from "@/lib/avatars-registry"
import { companyOntologyExists } from "@/lib/company-ontology-exists"
import { getIntegrationStatus } from "@/lib/get-integration-status"
import { dailyTeamLogInstalled } from "@/lib/daily-team-log-installed"
import { OnboardingWelcome } from "@/components/onboarding-welcome"
import { getAiExecutorIdForAgent } from "@/lib/ai-executor-registry"

export const dynamic = "force-dynamic"

export default async function AgentTreePage() {
  const [agents, adapters, avatars] = await Promise.all([
    getEffectiveAgents(),
    getEffectiveAdapters(),
    getAvatars(),
  ])
  if (agents.length === 0) {
    return (
      <main className="mx-auto max-w-5xl px-8 pb-12">
        <OnboardingWelcome />
      </main>
    )
  }

  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))
  const pipelineAgent = agents.find((agent) => agent.id === "email-pipeline-agent")
  const plhOpsSource = agents.find((agent) => agent.id === "plh-ops")

  const [results, launchdHealth, pollStatus] = await Promise.all([
    getAllActivities(agents, adapters),
    checkLaunchdJob(PIPELINE_LAUNCHD_LABEL),
    pipelineAgent
      ? checkPollLockStatus(pipelineAgent.rootPath)
      : Promise.resolve({ running: false, lockAgeSeconds: null }),
  ])

  // The toggle needs a plist to load/unload. A fresh install has neither the
  // agent nor the plist, so it sees nothing.
  const pipelinePlistExists = Boolean(pipelineAgent) && fs.existsSync(PIPELINE_LAUNCHD_PLIST_PATH)

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-8 pt-2 pb-12">
      <div className="a-rise">
        <p className="eyebrow">Your machine</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Agents</h1>
        <p className="text-sm text-muted-foreground">Status, avatars, and quick actions for every managed agent.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {await Promise.all(
          results.map(async (result, index) => {
            const latest = mergeAndSortActivities([result])[0] ?? null
            const ispipelineAgent = result.agent.id === "email-pipeline-agent"
            const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
            const isPlhOps = result.agent.id === "plh-ops"
            const isRegisteredCompany = !["email-pipeline-agent", "ai-company-starter-main", "plh-ops"].includes(
              result.agent.id
            )
            const isCommandSet = result.agent.kind === "command-set"
            const showVisibleRunOption = isCommandSet && process.platform === "darwin"
            const hasOntology = isCommandSet && (await companyOntologyExists(result.agent.rootPath))
            const needsCompanySetup = isCommandSet && !hasOntology
            const integrationStatus = await getIntegrationStatus(result.agent)
            const showInstallDailyTeamLogButton =
              Boolean(plhOpsSource) &&
              result.agent.kind === "command-set" &&
              !(await dailyTeamLogInstalled(result.agent.rootPath))
            const aiExecutorId = isCommandSet ? await getAiExecutorIdForAgent(result.agent.id) : undefined
            return (
              <AgentCard
                key={result.agent.id}
                agent={result.agent}
                latestActivity={latest}
                error={result.error}
                launchdHealth={ispipelineAgent ? launchdHealth : undefined}
                showScheduledJobToggle={ispipelineAgent && pipelinePlistExists}
                pollStatus={ispipelineAgent ? pollStatus : undefined}
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
                showOpenTerminalButton={showVisibleRunOption}
                showAiExecutorPicker={isCommandSet}
                showCompanyGuide={isCommandSet}
                hasOntology={hasOntology}
                aiExecutorId={aiExecutorId}
                index={index}
              />
            )
          })
        )}
      </div>
      <AddCompanyForm />
    </main>
  )
}
