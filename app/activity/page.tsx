import { AGENTS, ADAPTERS } from "@/lib/config"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { ActivityBoard } from "@/components/activity-board"

export default async function ActivityPage() {
  const results = await getAllActivities(AGENTS, ADAPTERS)
  const activities = mergeAndSortActivities(results)

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Activity</h1>
      <ActivityBoard activities={activities} />
    </main>
  )
}
