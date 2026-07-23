import { getEffectiveAgents, getEffectiveAdapters } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { ActivityBoard } from "@/components/activity-board"

export const dynamic = "force-dynamic"

export default async function ActivityPage() {
  const [agents, adapters] = await Promise.all([getEffectiveAgents(), getEffectiveAdapters()])
  const results = await getAllActivities(agents, adapters)
  const activities = mergeAndSortActivities(results)

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Activity</h1>
      <ActivityBoard activities={activities} />
    </main>
  )
}
