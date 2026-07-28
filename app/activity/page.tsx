import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { ActivityBoard } from "@/components/activity-board"

export const dynamic = "force-dynamic"

export default async function ActivityPage() {
  const [agents, adapters] = await Promise.all([getEffectiveAgents(), getEffectiveAdapters()])
  const results = await getAllActivities(agents, adapters)
  const activities = mergeAndSortActivities(results)

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-8 pt-2 pb-12">
      <div className="a-rise">
        <p className="eyebrow">Everything that happened</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Activity</h1>
      </div>
      <ActivityBoard activities={activities} />
    </main>
  )
}
