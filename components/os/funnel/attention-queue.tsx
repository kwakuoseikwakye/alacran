"use client"

import React from "react"
import {
  FUNNEL_STAGES,
  decayFactor,
  journeyMeta,
  type FunnelJourney,
} from "@/lib/os/departments/adapters/funnel-adapter"

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

export function AttentionRow({
  journey,
  now,
  onSelect,
}: {
  journey: FunnelJourney
  now: Date
  onSelect?: (id: string) => void
}) {
  const meta = journeyMeta(journey, now)
  const decay = decayFactor(meta.daysSinceLastTouch, journey.status)
  const stageLabel = FUNNEL_STAGES.find((s) => s.id === journey.status)?.label ?? journey.status

  return (
    <div
      onClick={() => onSelect?.(journey.id)}
      className="group flex cursor-pointer items-baseline gap-2 border-t border-os-border px-3 py-2 transition-colors hover:bg-os-surface2"
    >
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-os-text group-hover:text-os-accent">
        {journey.person ?? journey.name}
      </span>
      {journey.company && (
        <span className="hidden max-w-[120px] truncate text-[10.5px] text-os-dim sm:inline">
          {journey.company}
        </span>
      )}
      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-wide text-os-dim">
        {stageLabel}
      </span>
      <span
        className="shrink-0 font-mono text-[10px]"
        style={
          decay > 0
            ? {
                color: `color-mix(in oklab, var(--os-err, #f43f5e) ${Math.round(
                  Math.sqrt(decay) * 85
                )}%, var(--os-dim, #9ca3af))`,
              }
            : { color: "var(--os-dim, #9ca3af)" }
        }
      >
        {meta.daysSinceLastTouch}d
      </span>
      <span className="shrink-0 font-mono text-[10px] text-os-muted">{journey.likelihood}%</span>
      {journey.amountUsd > 0 && (
        <span className="shrink-0 font-mono text-[10px] text-os-muted">{usd(journey.amountUsd)}</span>
      )}
    </div>
  )
}

export function AttentionQueue({
  pushNow,
  saveNow,
  now,
  onSelect,
}: {
  pushNow: FunnelJourney[]
  saveNow: FunnelJourney[]
  now: Date
  onSelect?: (id: string) => void
}) {
  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* PUSH NOW */}
      <div className="rounded-lg border border-os-border bg-os-surface">
        <div className="flex items-baseline justify-between px-3 py-2">
          <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-os-accent">
            push now
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wide text-os-dim">
            hot + moving — close them
          </span>
        </div>
        {pushNow.length === 0 ? (
          <p className="border-t border-os-border px-3 py-2 font-mono text-[10px] text-os-dim">
            no hot leads in motion right now
          </p>
        ) : (
          pushNow.map((j) => (
            <AttentionRow key={j.id} journey={j} now={now} onSelect={onSelect} />
          ))
        )}
      </div>

      {/* SAVE NOW */}
      <div className="rounded-lg border border-os-border bg-os-surface">
        <div className="flex items-baseline justify-between px-3 py-2">
          <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-os-err">
            save now
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wide text-os-dim">
            fading toward archive — highest likelihood first
          </span>
        </div>
        {saveNow.length === 0 ? (
          <p className="border-t border-os-border px-3 py-2 font-mono text-[10px] text-os-dim">
            nothing fading — every lead is fresh
          </p>
        ) : (
          saveNow.map((j) => (
            <AttentionRow key={j.id} journey={j} now={now} onSelect={onSelect} />
          ))
        )}
      </div>
    </section>
  )
}
