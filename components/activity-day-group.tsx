"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusDot } from "@/components/status-dot"
import type { Activity } from "@/lib/adapters/types"

export function ActivityDayGroup({
  label,
  activities,
  defaultExpanded,
  onSelect,
}: {
  label: string
  activities: Activity[]
  defaultExpanded: boolean
  onSelect: (activity: Activity) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{label}</span>
        <span className="text-xs">
          {activities.length} {activities.length === 1 ? "activity" : "activities"}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2">
          {activities.map((activity) => (
            <Card key={activity.id} className="cursor-pointer" onClick={() => onSelect(activity)}>
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
      )}
    </div>
  )
}
