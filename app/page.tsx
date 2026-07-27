import { PIPELINE_LAUNCHD_LABEL } from "@/lib/config"
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

export const dynamic = "force-dynamic"

export default async function AgentTreePage() {
  const [agents, adapters, avatars] = await Promise.all([
    getEffectiveAgents(),
    getEffectiveAdapters(),
    getAvatars(),
  ])
  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))
  const pipelineAgent = agents.find((agent) => agent.id === "email-pipeline-agent")

  const [results, launchdHealth, pollStatus] = await Promise.all([
    getAllActivities(agents, adapters),
    checkLaunchdJob(PIPELINE_LAUNCHD_LABEL),
    pipelineAgent
      ? checkPollLockStatus(pipelineAgent.rootPath)
      : Promise.resolve({ running: false, lockAgeSeconds: null }),
  ])

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">AI-Native Agents</h1>
        <p className="text-sm text-muted-foreground">Status, avatars, and quick actions for every managed agent.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {await Promise.all(
          results.map(async (result) => {
            const latest = mergeAndSortActivities([result])[0] ?? null
            const ispipelineAgent = result.agent.id === "email-pipeline-agent"
            const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
            const isPlhOps = result.agent.id === "plh-ops"
            const isRegisteredCompany = !["email-pipeline-agent", "ai-company-starter-main", "plh-ops"].includes(
              result.agent.id
            )
            const needsCompanySetup =
              result.agent.kind === "command-set" && !(await companyOntologyExists(result.agent.rootPath))
            const integrationStatus = await getIntegrationStatus(result.agent)
            const showInstallDailyTeamLogButton =
              result.agent.kind === "command-set" && !(await dailyTeamLogInstalled(result.agent.rootPath))
            return (
              <AgentCard
                key={result.agent.id}
                agent={result.agent}
                latestActivity={latest}
                error={result.error}
                launchdHealth={ispipelineAgent ? launchdHealth : undefined}
                pollStatus={ispipelineAgent ? pollStatus : undefined}
                showVerifyButton={isAiCompanyStarterMain}
                showDailyTeamLogButton={isPlhOps}
                removable={isRegisteredCompany}
                avatarUrl={avatarByAgentId[result.agent.id] ?? null}
                showSetupCompanyButton={needsCompanySetup}
                integrationStatus={integrationStatus}
                showInstallDailyTeamLogButton={showInstallDailyTeamLogButton}
              />
            )
          })
        )}
      </div>
      <AddCompanyForm />
    </main>
  )
}
