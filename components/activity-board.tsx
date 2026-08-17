"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { Activity } from "@/lib/adapters/types"
import { getActivityDetail } from "@/lib/get-activity-detail"
import { groupActivitiesByDay } from "@/lib/group-activities-by-day"
import { ActivityDayGroup } from "@/components/activity-day-group"

const PAGE_SIZE = 15

export function ActivityBoard({ activities }: { activities: Activity[] }) {
  const [selected, setSelected] = useState<Activity | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)

  async function openActivity(activity: Activity) {
    setSelected(activity)
    setDetail(null)
    setDetailError(null)
    try {
      const content = await getActivityDetail(activity.detailPath)
      setDetail(content)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    }
  }

  const totalPages = Math.ceil(activities.length / PAGE_SIZE)
  const paginatedActivities = activities.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const dayGroups = groupActivitiesByDay(paginatedActivities)

  return (
    <>
      <div className="space-y-8">
        <div className="space-y-6">
          {dayGroups.map((group, index) => (
            <ActivityDayGroup
              key={group.key}
              label={group.label}
              activities={group.activities}
              defaultExpanded={index === 0}
              onSelect={openActivity}
            />
          ))}
        </div>
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border pt-6">
            <button
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              className="px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
            >
              ← Previous
            </button>
            <div className="text-sm font-mono text-muted-foreground">
              Page {currentPage + 1} of {totalPages}
            </div>
            <button
              disabled={currentPage === totalPages - 1}
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              className="px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
            >
              Next →
            </button>
          </div>
        )}
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl border-l border-glass-edge bg-background/80 backdrop-blur-2xl">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle className="text-foreground">{selected?.title}</SheetTitle>
          </SheetHeader>
          <div className="h-[80vh] overflow-y-auto pt-4">
            {detailError && <p className="text-red-500 text-sm font-mono">{detailError}</p>}
            {!detailError && <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground p-4 bg-card/60/50 rounded-lg border border-border">{detail ?? "Loading…"}</pre>}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
