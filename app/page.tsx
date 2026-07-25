import { TAKESHI_AGENT_LAUNCHD_LABEL } from "@/lib/config"
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
  const takeshiAgent = agents.find((agent) => agent.id === "plh-takeshi-agent")

  const [results, launchdHealth, pollStatus] = await Promise.all([
    getAllActivities(agents, adapters),
    checkLaunchdJob(TAKESHI_AGENT_LAUNCHD_LABEL),
    takeshiAgent
      ? checkPollLockStatus(takeshiAgent.rootPath)
      : Promise.resolve({ running: false, lockAgeSeconds: null }),
  ])

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">AI-Native Agents</h1>
        <p className="text-sm text-muted-foreground">Status, avatars, and quick actions for every managed agent.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => {
          const latest = mergeAndSortActivities([result])[0] ?? null
          const isTakeshiAgent = result.agent.id === "plh-takeshi-agent"
          const isAiCompanyStarterMain = result.agent.id === "ai-company-starter-main"
          const isPlhOps = result.agent.id === "plh-ops"
          const isRegisteredCompany = !["plh-takeshi-agent", "ai-company-starter-main", "plh-ops"].includes(
            result.agent.id
          )
          return (
            <AgentCard
              key={result.agent.id}
              agent={result.agent}
              latestActivity={latest}
              error={result.error}
              launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
              pollStatus={isTakeshiAgent ? pollStatus : undefined}
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
