import { AGENTS, ADAPTERS, TAKESHI_AGENT_LAUNCHD_LABEL } from "@/lib/config"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { checkLaunchdJob } from "@/lib/adapters/launchd"
import { AgentCard } from "@/components/agent-card"

export default async function AgentTreePage() {
  const [results, launchdHealth] = await Promise.all([
    getAllActivities(AGENTS, ADAPTERS),
    checkLaunchdJob(TAKESHI_AGENT_LAUNCHD_LABEL),
  ])

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">AI-Native Agents</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {results.map((result) => {
          const latest = mergeAndSortActivities([result])[0] ?? null
          return (
            <AgentCard
              key={result.agent.id}
              agent={result.agent}
              latestActivity={latest}
              error={result.error}
              launchdHealth={result.agent.id === "plh-takeshi-agent" ? launchdHealth : undefined}
            />
          )
        })}
      </div>
    </main>
  )
}
