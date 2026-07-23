import { PIPELINE_LAUNCHD_LABEL } from "@/lib/config"
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { checkLaunchdJob } from "@/lib/adapters/launchd"
import { checkPollLockStatus } from "@/lib/adapters/poll-lock"
import { AgentCard } from "@/components/agent-card"
import { AddCompanyForm } from "@/components/add-company-form"
import { getAvatars } from "@/lib/avatars-registry"

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
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">AI-Native Agents</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {results.map((result) => {
          const latest = mergeAndSortActivities([result])[0] ?? null
          const ispipelineAgent = result.agent.id === "email-pipeline-agent"
          const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
          const isPlhOps = result.agent.id === "plh-ops"
          const isRegisteredCompany = !["email-pipeline-agent", "ai-company-starter-main", "plh-ops"].includes(
            result.agent.id
          )
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
            />
          )
        })}
      </div>
      <AddCompanyForm />
    </main>
  )
}
