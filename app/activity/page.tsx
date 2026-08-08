import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { ActivityBoard } from "@/components/activity-board"

export const dynamic = "force-dynamic"

export default async function ActivityPage() {
  const [agents, adapters] = await Promise.all([getEffectiveAgents(), getEffectiveAdapters()])
  const results = await getAllActivities(agents, adapters)
  const activities = mergeAndSortActivities(results)

  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">Everything that happened</p>
          <h1>Activity</h1>
          <p>A live log of every action every agent has taken on this machine.</p>
        </div>
      </header>
      <div className="dash-content">
        <ActivityBoard activities={activities} />
      </div>
    </>
  )
}
