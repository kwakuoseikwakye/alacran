"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusDot } from "@/components/status-dot"
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

  const needsAttention = activities
    .filter((a) => a.status === "needs-attention")
    .sort((a, b) => b.timestamp - a.timestamp)
  
  const totalPages = Math.ceil(activities.length / PAGE_SIZE)
  const paginatedActivities = activities.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const dayGroups = groupActivitiesByDay(paginatedActivities)

  return (
    <>
      <div className="space-y-8">
        {needsAttention.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-red-500">Needs Attention</h2>
            <div className="space-y-2">
              {needsAttention.map((activity) => (
                <div
                  key={activity.id}
                  onClick={() => openActivity(activity)}
                  className="group flex cursor-pointer items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 p-4 transition-all hover:border-red-500/60 hover:bg-red-500/10"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={activity.status} />
                    <span className="font-medium text-sm text-bone">{activity.title}</span>
                  </div>
                  <span className="text-xs text-dune font-mono">
                    {new Date(activity.timestamp * 1000).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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
          <div className="flex items-center justify-between border-t border-line pt-6">
            <button
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              className="px-4 py-2 text-sm font-medium text-dune transition-colors hover:text-bone disabled:opacity-30 disabled:hover:text-dune"
            >
              ← Previous
            </button>
            <div className="text-sm font-mono text-dune">
              Page {currentPage + 1} of {totalPages}
            </div>
            <button
              disabled={currentPage === totalPages - 1}
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              className="px-4 py-2 text-sm font-medium text-dune transition-colors hover:text-bone disabled:opacity-30 disabled:hover:text-dune"
            >
              Next →
            </button>
          </div>
        )}
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl border-l border-glass-edge bg-void/80 backdrop-blur-2xl">
          <SheetHeader className="border-b border-line pb-4">
            <SheetTitle className="text-bone">{selected?.title}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[80vh] pt-4">
            {detailError && <p className="text-red-500 text-sm font-mono">{detailError}</p>}
            {!detailError && <pre className="whitespace-pre-wrap text-xs font-mono text-dune p-4 bg-shell/50 rounded-lg border border-line">{detail ?? "Loading…"}</pre>}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
