"use client"

import React, { useState } from "react"
import {
  FUNNEL_STAGES,
  CHANNEL_GLYPHS,
  decayFactor,
  journeyMeta,
  ventureColor,
  contactActions,
  RELATIONSHIP_VAR,
  type FunnelJourney,
  type FunnelStageId,
  type FunnelTouch,
} from "@/lib/os/departments/adapters/funnel-adapter"
import { SectionHead } from "@/components/os/terminal"
import { agoDays, lastMessageFor, type FunnelCommsItem } from "@/lib/os/funnel/contact"

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

function TouchChip({ touch }: { touch: FunnelTouch }) {
  return (
    <span
      className="inline-flex max-w-[260px] items-center gap-1.5 rounded-xs border border-os-border bg-os-surface2 px-2 py-1"
      title={`${touch.stage} · via ${touch.source} · ${touch.at}`}
    >
      <span className="shrink-0 font-mono text-[10px] text-os-accent">
        {CHANNEL_GLYPHS[touch.channel] ?? "·"}
      </span>
      <span className="truncate text-[11px] text-os-muted">{touch.label}</span>
      <span className="shrink-0 font-mono text-[9.5px] text-os-dim">
        {touch.at.length > 5 ? touch.at.slice(5) : touch.at}
      </span>
    </span>
  )
}

function ContactActions({ journey }: { journey: FunnelJourney }) {
  const actions = contactActions(journey)
  return (
    <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide">
      {actions.email && (
        <a
          href={`mailto:${actions.email}`}
          title={actions.email}
          className="text-os-muted hover:text-os-accent"
        >
          email
        </a>
      )}
      {actions.wa && (
        <a
          href={actions.wa}
          target="_blank"
          rel="noopener noreferrer"
          title={journey.phone ?? undefined}
          className="text-os-muted hover:text-os-accent"
        >
          wa
        </a>
      )}
      {actions.sms && (
        <a
          href={actions.sms}
          title={journey.phone ?? undefined}
          className="text-os-muted hover:text-os-accent"
        >
          sms
        </a>
      )}
      {actions.crmUrl && (
        <a
          href={actions.crmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-os-dim hover:text-os-accent"
        >
          {actions.isGhl ? "ghl↗" : "attio↗"}
        </a>
      )}
      {!actions.email && !actions.wa && !actions.sms && !actions.crmUrl && (
        <span className="text-os-dim">—</span>
      )}
    </span>
  )
}

/** Two table rows per client: the formatted data line, then their touches. */
function JourneyTableRows({
  journey,
  now,
  lastMsg,
}: {
  journey: FunnelJourney
  now: Date
  lastMsg?: FunnelCommsItem | null
}) {
  const stageLabel = FUNNEL_STAGES.find((s) => s.id === journey.status)?.label ?? journey.status
  const converted = journey.status === "converted"
  const meta = journeyMeta(journey, now)
  const decay = decayFactor(meta.daysSinceLastTouch, journey.status)
  const entrySource = journey.touches[0]?.source
  const lane =
    entrySource === "attio" || entrySource === "ghl"
      ? "crm"
      : journey.touches[0]?.channel === "ads"
      ? "ads"
      : "organic"

  return (
    <>
      <tr className="border-t border-os-border">
        <td className="px-3 py-2.5">
          <span className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: ventureColor(journey.venture) }}
              title={journey.venture ?? "All"}
            />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-os-text" title={journey.name}>
                {journey.person ?? journey.name}
              </span>
              {journey.company && (
                <span className="block truncate text-[10px] text-os-dim">{journey.company}</span>
              )}
            </span>
          </span>
        </td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-wide">
          <span
            className={
              converted
                ? "text-os-ok"
                : meta.state === "stalled"
                ? "text-os-err"
                : "text-os-muted"
            }
          >
            {stageLabel}
          </span>
        </td>
        <td
          className={`px-3 py-2.5 font-mono text-[11px] ${
            meta.state === "stalled" && decay === 0 ? "text-os-err" : "text-os-dim"
          }`}
          style={
            decay > 0
              ? {
                  color: `color-mix(in oklab, var(--os-err, #f43f5e) ${Math.round(
                    Math.sqrt(decay) * 85
                  )}%, var(--os-dim, #9ca3af))`,
                }
              : undefined
          }
        >
          {meta.daysSinceLastTouch}d
        </td>
        <td
          className="px-3 py-2.5 font-mono text-[10.5px] capitalize"
          style={{ color: RELATIONSHIP_VAR[journey.relationship] }}
        >
          {journey.relationship}
        </td>
        <td className="px-3 py-2.5 font-mono text-[11px] text-os-muted">{journey.likelihood}%</td>
        <td className="px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-wide text-os-dim">
          {lane}
        </td>
        <td className="max-w-[220px] px-3 py-2.5">
          {converted ? (
            <span
              className="block truncate font-mono text-[10.5px] text-os-ok"
              title={journey.product ?? undefined}
            >
              {usd(journey.amountUsd ?? 0)}
              {journey.product ? ` · ${journey.product}` : ""}
            </span>
          ) : (
            <span className="font-mono text-[10.5px] text-os-dim">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <ContactActions journey={journey} />
        </td>
      </tr>
      <tr>
        <td colSpan={8} className="px-3 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {journey.touches.map((t, i) => (
              <span key={t.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="font-mono text-[10px] text-os-dim">→</span>}
                <TouchChip touch={t} />
              </span>
            ))}
            {!converted && <span className="font-mono text-[10px] text-os-dim">→ …</span>}
            {lastMsg !== undefined && (
              <span className="ml-auto flex min-w-0 items-center gap-1.5 font-mono text-[10px]">
                <span className="shrink-0 uppercase tracking-wide text-os-dim">last msg</span>
                {lastMsg ? (
                  <span className="min-w-0 truncate text-os-muted" title={lastMsg.preview}>
                    via {lastMsg.source} · {agoDays(lastMsg.ts, now)} · “{lastMsg.preview.slice(0, 60)}”
                  </span>
                ) : (
                  <span className="text-os-dim">no thread on record</span>
                )}
              </span>
            )}
          </div>
        </td>
      </tr>
    </>
  )
}

export function JourneyTable({
  journeys,
  now,
  stageCounts,
  commsFeed,
  initialStage = "all",
  onStageSelect,
}: {
  journeys: FunnelJourney[]
  now: Date
  stageCounts: Record<FunnelStageId, number>
  commsFeed?: FunnelCommsItem[] | null
  initialStage?: FunnelStageId | "all"
  onStageSelect?: (stage: FunnelStageId | "all") => void
}) {
  const [selectedStage, setSelectedStage] = useSafeState<FunnelStageId | "all">(initialStage)

  const handleStageClick = (s: FunnelStageId | "all") => {
    setSelectedStage(s)
    onStageSelect?.(s)
  }

  const filtered =
    selectedStage === "all" ? journeys : journeys.filter((j) => j.status === selectedStage)

  return (
    <section className="space-y-3">
      <SectionHead label="Journey data" count={`${filtered.length}`} />

      {/* Segment Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => handleStageClick("all")}
          className={`rounded-xs border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
            selectedStage === "all"
              ? "border-os-accent bg-os-accent/10 text-os-accent"
              : "border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted"
          }`}
        >
          All segments ({journeys.length})
        </button>
        {FUNNEL_STAGES.map((s) => {
          const active = selectedStage === s.id
          return (
            <button
              key={s.id}
              onClick={() => handleStageClick(active ? "all" : s.id)}
              className={`rounded-xs border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                active
                  ? "border-os-accent bg-os-accent/10 text-os-accent"
                  : "border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted"
              }`}
            >
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{
                  background:
                    s.id === "first_touch"
                      ? "var(--os-accent, #3df08c)"
                      : s.id === "engaged"
                      ? "#38bdf8"
                      : s.id === "nurtured"
                      ? "#a78bfa"
                      : s.id === "opted_in"
                      ? "#f59e0b"
                      : "#10b981",
                }}
              />
              {s.label} ({stageCounts[s.id] ?? 0})
            </button>
          )
        })}
        {selectedStage !== "all" && commsFeed === null && filtered.length > 0 && (
          <span className="font-mono text-[10px] text-os-dim">
            comms feed unavailable — last messages hidden
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-os-border bg-os-surface px-4 py-6 text-center font-mono text-[11.5px] text-os-dim">
          No leads in this segment.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-os-border bg-os-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
                <th className="px-3 pb-1 pt-3 font-normal">Client</th>
                <th className="px-3 pb-1 pt-3 font-normal">Stage</th>
                <th className="px-3 pb-1 pt-3 font-normal">Quiet</th>
                <th className="px-3 pb-1 pt-3 font-normal">Relationship</th>
                <th className="px-3 pb-1 pt-3 font-normal">Likelihood</th>
                <th className="px-3 pb-1 pt-3 font-normal">Entry</th>
                <th className="px-3 pb-1 pt-3 font-normal">Value</th>
                <th className="px-3 pb-1 pt-3 font-normal">Contact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <JourneyTableRows
                  key={j.id}
                  journey={j}
                  now={now}
                  lastMsg={
                    commsFeed && selectedStage !== "all" ? lastMessageFor(j, commsFeed) : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
