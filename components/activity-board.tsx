"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StatusDot } from "@/components/status-dot"
import type { Activity } from "@/lib/adapters/types"
import { getActivityDetail } from "@/lib/get-activity-detail"
import { groupActivitiesByDay } from "@/lib/group-activities-by-day"
import { ActivityDayGroup } from "@/components/activity-day-group"

export function ActivityBoard({ activities }: { activities: Activity[] }) {
  const [selected, setSelected] = useState<Activity | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

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
  const dayGroups = groupActivitiesByDay(activities)

  return (
    <>
      <div className="space-y-6">
        {needsAttention.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-destructive">Needs Attention</h2>
            <div className="space-y-2">
              {needsAttention.map((activity) => (
                <Card
                  key={activity.id}
                  className="cursor-pointer border-destructive/30"
                  onClick={() => openActivity(activity)}
                >
                  <CardHeader className="p-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <StatusDot status={activity.status} />
                      {activity.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                    {new Date(activity.timestamp * 1000).toLocaleString()}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-4">
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
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[80vh] pr-4">
            {detailError && <p className="text-destructive">{detailError}</p>}
            {!detailError && <pre className="whitespace-pre-wrap text-sm">{detail ?? "Loading…"}</pre>}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
