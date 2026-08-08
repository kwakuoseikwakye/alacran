"use client"

import { useState } from "react"
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
    <div className="space-y-3">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-2 py-1 text-left"
      >
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-bone">
          {label}
        </span>
        <span className="font-mono text-xs text-dune">
          {activities.length} {activities.length === 1 ? "event" : "events"}
        </span>
      </button>
      
      {expanded && (
        <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-line bg-shell-2">
          {activities.map((activity, i) => (
            <div
              key={activity.id}
              onClick={() => onSelect(activity)}
              className={`group flex cursor-pointer items-center justify-between bg-shell p-4 transition-all hover:bg-void ${
                i !== activities.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <StatusDot status={activity.status} />
                <span className="text-sm font-medium text-bone transition-colors group-hover:text-red-400">
                  {activity.title}
                </span>
              </div>
              <span className="font-mono text-xs text-dune">
                {new Date(activity.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
