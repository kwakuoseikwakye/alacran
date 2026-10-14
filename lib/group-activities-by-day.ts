import type { Activity } from "./adapters/types"

export type ActivityDayGroup = {
  key: string
  label: string
  activities: Activity[]
}

function startOfLocalDayMs(timestampSeconds: number): number {
  const d = new Date(timestampSeconds * 1000)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function formatAbsoluteDate(dayStartMs: number): string {
  return new Date(dayStartMs).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function groupActivitiesByDay(
  activities: Activity[],
  nowSeconds: number = Date.now() / 1000
): ActivityDayGroup[] {
  const todayStartMs = startOfLocalDayMs(nowSeconds)
  const yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000

  const buckets = new Map<number, Activity[]>()
  for (const activity of activities) {
    const dayStartMs = startOfLocalDayMs(activity.timestamp)
    const bucket = buckets.get(dayStartMs)
    if (bucket) {
      bucket.push(activity)
    } else {
      buckets.set(dayStartMs, [activity])
    }
  }

  const sortedDayStarts = Array.from(buckets.keys()).sort((a, b) => b - a)

  return sortedDayStarts.map((dayStartMs) => {
    const dayActivities = buckets
      .get(dayStartMs)!
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)

    let label: string
    if (dayStartMs === todayStartMs) {
      label = "Today"
    } else if (dayStartMs === yesterdayStartMs) {
      label = "Yesterday"
    } else {
      label = formatAbsoluteDate(dayStartMs)
    }

    return { key: String(dayStartMs), label, activities: dayActivities }
  })
}
