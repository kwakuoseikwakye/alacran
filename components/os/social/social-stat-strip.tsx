"use client"

import React, { useState } from "react"
import { TrendingUp, TrendingDown, Users, Eye, Heart } from "lucide-react"
import { formatFollowers, formatPct } from "@/lib/os/departments/adapters/social-adapter"

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

export function SocialStatStrip({
  stats,
  platformsCount,
}: {
  stats: {
    audienceTotal: number
    growth7d: number | null
    growth30d: number | null
    totalImpressions: number
    totalEngagements: number
  }
  platformsCount: number
}) {
  const [range, setRange] = useSafeState<"7d" | "30d">("7d")
  const currentGrowth = range === "7d" ? stats.growth7d : stats.growth30d

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {/* Total reach */}
      <div className="flex flex-col gap-1 rounded-lg border border-os-border bg-os-surface px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
            Total reach
          </span>
          <Users className="h-3.5 w-3.5 text-os-dim" />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[20px] font-semibold leading-none tracking-[-0.02em] text-os-text">
            {formatFollowers(stats.audienceTotal)}
          </span>
          <span className="truncate font-mono text-[9.5px] text-os-dim">
            {platformsCount} platforms
          </span>
        </div>
      </div>

      {/* Audience growth */}
      <div className="flex flex-col gap-1 rounded-lg border border-os-border bg-os-surface px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
            Audience growth
          </span>
          <div className="flex gap-1 font-mono text-[9px]">
            <button
              onClick={() => setRange("7d")}
              className={`rounded-xs px-1.5 py-0.5 uppercase ${
                range === "7d" ? "bg-os-accent/10 text-os-accent border border-os-accent/30" : "text-os-dim"
              }`}
            >
              7d
            </button>
            <button
              onClick={() => setRange("30d")}
              className={`rounded-xs px-1.5 py-0.5 uppercase ${
                range === "30d" ? "bg-os-accent/10 text-os-accent border border-os-accent/30" : "text-os-dim"
              }`}
            >
              30d
            </button>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`font-mono text-[20px] font-semibold leading-none tracking-[-0.02em] ${
              currentGrowth == null
                ? "text-os-dim"
                : currentGrowth >= 0
                ? "text-os-ok"
                : "text-os-err"
            }`}
          >
            {formatPct(currentGrowth)}
          </span>
          <span className="flex items-center gap-1 font-mono text-[9.5px] text-os-dim">
            {currentGrowth != null && (currentGrowth >= 0 ? (
              <TrendingUp className="h-3 w-3 text-os-ok" />
            ) : (
              <TrendingDown className="h-3 w-3 text-os-err" />
            ))}
            <span>{range} change</span>
          </span>
        </div>
      </div>

      {/* Total Impressions */}
      <div className="flex flex-col gap-1 rounded-lg border border-os-border bg-os-surface px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
            Impressions
          </span>
          <Eye className="h-3.5 w-3.5 text-os-dim" />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[20px] font-semibold leading-none tracking-[-0.02em] text-os-text">
            {formatFollowers(stats.totalImpressions)}
          </span>
          <span className="font-mono text-[9.5px] text-os-dim">total views</span>
        </div>
      </div>

      {/* Total Engagements */}
      <div className="flex flex-col gap-1 rounded-lg border border-os-border bg-os-surface px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-os-dim">
            Engagements
          </span>
          <Heart className="h-3.5 w-3.5 text-os-dim" />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[20px] font-semibold leading-none tracking-[-0.02em] text-os-text">
            {formatFollowers(stats.totalEngagements)}
          </span>
          <span className="font-mono text-[9.5px] text-os-dim">likes & replies</span>
        </div>
      </div>
    </div>
  )
}
