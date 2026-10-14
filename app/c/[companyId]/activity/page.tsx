import { notFound } from "next/navigation"
import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { ActivityBoard } from "@/components/activity-board"

export const dynamic = "force-dynamic"

export default async function ActivityPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const [allAgents, adapters] = await Promise.all([getEffectiveAgents(), getEffectiveAdapters()])
  const agents = allAgents.filter((a) => a.id === companyId)
  if (agents.length === 0) notFound()

  const results = await getAllActivities(agents, adapters)
  const activities = mergeAndSortActivities(results)

  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">Everything that happened</p>
          <h1>Activity</h1>
          <p>Every run for {agents[0].name}, newest first.</p>
        </div>
      </header>
      <div className="dash-content">
        <ActivityBoard
          activities={activities}
          agentNames={Object.fromEntries(agents.map((a) => [a.id, a.name]))}
        />
      </div>
    </>
  )
}
