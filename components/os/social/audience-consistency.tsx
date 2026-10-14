"use client"

import React from "react"
import { SharePie } from "@/components/os/share-pie"
import { formatFollowers } from "@/lib/os/departments/adapters/social-adapter"

export function AudienceConsistency({
  points,
  pieItems,
  total,
}: {
  points: { date: string; total: number }[]
  pieItems: { key: string; label: string; value: number }[]
  total: number
}) {
  const maxVal = Math.max(1, ...points.map((p) => p.total))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      {/* Activity Timeline Bar / Heatmap */}
      <div className="rounded-lg border border-os-border bg-os-surface p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-os-text">Audience Growth & Activity</h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
              Cross-platform follower trajectory
            </p>
          </div>
          <span className="font-mono text-[13px] font-bold text-os-accent">
            {formatFollowers(total)} total
          </span>
        </div>

        {points.length === 0 ? (
          <div className="flex h-44 items-center justify-center font-mono text-[11px] text-os-dim">
            No snapshot history recorded yet
          </div>
        ) : (
          <div className="flex h-44 items-end gap-2 pt-6">
            {points.map((p) => {
              const h = Math.max(8, (p.total / maxVal) * 140)
              return (
                <div key={p.date} className="group relative flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex w-full items-end justify-center h-36">
                    <div
                      className="w-full max-w-[28px] rounded-xs bg-os-accent opacity-75 transition-opacity group-hover:opacity-100"
                      style={{ height: `${h}px` }}
                    />
                  </div>
                  <span className="font-mono text-[8.5px] text-os-dim group-hover:text-os-text">
                    {p.date.slice(5)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SharePie Audience Donut */}
      <div className="flex flex-col items-center justify-center rounded-lg border border-os-border bg-os-surface p-5">
        <SharePie
          items={pieItems}
          total={total}
          centerLabel="Audience"
          format={formatFollowers}
          donutPx={180}
          ariaLabel="Audience share by platform"
        />
      </div>
    </div>
  )
}
