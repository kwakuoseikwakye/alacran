"use client"

import React, { useState, useTransition } from "react"
import type {
  FunnelViewModel,
  FunnelStageId,
  FunnelVenture,
} from "@/lib/os/departments/adapters/funnel-adapter"
import {
  VENTURE_TABS,
  ventureColor,
  FUNNEL_STAGES,
  journeyMeta,
  DECAY_DAYS,
} from "@/lib/os/departments/adapters/funnel-adapter"
import { Badge } from "@/components/os/terminal"
import { FunnelSpace } from "./funnel-space"
import { FunnelRadial } from "./funnel-radial"
import { AttentionQueue } from "./attention-queue"
import { JourneyTable } from "./journey-table"
import type { FunnelCommsItem } from "@/lib/os/funnel/contact"

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

function useSafeTransition(): [boolean, (fn: () => void) => void] {
  try {
    return useTransition()
  } catch {
    return [false, (fn: () => void) => fn()]
  }
}

export function FunnelCockpit({
  model,
  companyId,
  initialParams,
  commsFeed,
}: {
  model: FunnelViewModel
  companyId: string
  initialParams?: {
    venture?: string
    view?: string
    stage?: string
    layout?: string
    lead?: string
  }
  commsFeed?: FunnelCommsItem[] | null
}) {
  const [, startTransition] = useSafeTransition()
  const [venture, setVenture] = useSafeState<FunnelVenture | "all">(
    (initialParams?.venture as FunnelVenture) ?? "all"
  )
  const [layout, setLayout] = useSafeState<"flow" | "radial">(
    initialParams?.layout === "radial" ? "radial" : "flow"
  )
  const [view, setView] = useSafeState<"live" | "archive">(
    initialParams?.view === "archive" ? "archive" : "live"
  )
  const [selectedLeadId, setSelectedLeadId] = useSafeState<string | null>(
    initialParams?.lead ?? null
  )
  const [stage, setStage] = useSafeState<FunnelStageId | "all">(
    (initialParams?.stage as FunnelStageId) ?? "all"
  )

  const now = new Date()

  // Sync URL query without full page reload
  const updateUrl = (
    nextVenture: string,
    nextView: string,
    nextLayout: string,
    nextStage: string,
    nextLead?: string | null
  ) => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams()
    if (nextVenture && nextVenture !== "all") params.set("venture", nextVenture)
    if (nextView === "archive") params.set("view", "archive")
    if (nextLayout === "radial") params.set("layout", "radial")
    if (nextStage && nextStage !== "all") params.set("stage", nextStage)
    if (nextLead) params.set("lead", nextLead)
    const qs = params.toString()
    const targetUrl = `/c/${companyId}/funnel${qs ? `?${qs}` : ""}`
    startTransition(() => {
      window.history.replaceState(null, "", targetUrl)
    })
  }

  // Filter journeys by current venture tab if user switched client tab
  const journeysToUse =
    venture === "all"
      ? model.activeJourneys
      : model.activeJourneys.filter((j) => j.venture === venture)

  const archivedToUse =
    venture === "all"
      ? model.archivedJourneys
      : model.archivedJourneys.filter((j) => j.venture === venture)

  const spaceNodes =
    venture === "all"
      ? model.spaceNodes
      : model.spaceNodes.filter((n) => n.venture === venture)

  const radialModel = {
    ...model.radial,
    nodes:
      venture === "all"
        ? model.radial.nodes
        : model.radial.nodes.filter((n) => n.venture === venture),
  }

  const { summary, attention, isLive, liveLabel, connectors, stageCounts } = model

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <header className="mb-2 flex items-end justify-between gap-4">
        <h1 className="text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em]">Funnel</h1>
        <div className="flex shrink-0 items-center gap-2">
          {isLive ? (
            <Badge tone="ok">{liveLabel}</Badge>
          ) : (
            <Badge tone="warn" ghost>
              demo data
            </Badge>
          )}
          <Badge tone="accent">
            {summary.converted}/{summary.clients} converted · {usd(summary.revenueUsd)}
          </Badge>
        </div>
      </header>

      {/* Control Line: Venture Tabs · Synced Sources · View Toggles */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-os-border pb-3">
        {/* Venture Filter Tabs */}
        <span className="flex items-center gap-1.5">
          {VENTURE_TABS.map((tab) => {
            const active = venture === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setVenture(tab.id)
                  updateUrl(tab.id, view, layout, stage, selectedLeadId)
                }}
                className={`rounded-xs border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                  active
                    ? "border-os-accent bg-os-accent/10 text-os-accent"
                    : "border-os-border text-os-dim hover:border-os-border-strong hover:text-os-muted"
                }`}
              >
                {tab.id !== "all" && (
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                    style={{ background: ventureColor(tab.id as FunnelVenture) }}
                  />
                )}
                {tab.label}
              </button>
            )
          })}
        </span>

        <span className="h-3 w-px bg-os-border" />

        {/* Synced Sources Status */}
        <span className="flex items-center gap-2.5">
          {connectors.map((c) => {
            const ok = c.status === "connected"
            return (
              <span
                key={c.id}
                title={c.detail}
                className={`inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] ${
                  ok ? (isLive ? "text-os-ok" : "text-os-muted") : "text-os-dim"
                }`}
              >
                {ok ? "✓" : "○"} {c.label}
              </span>
            )
          })}
        </span>

        {/* Perspective (flow / radial) & View (live / archive) Toggles */}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide">
          <button
            onClick={() => {
              setLayout("flow")
              setView("live")
              updateUrl(venture, "live", "flow", stage, selectedLeadId)
            }}
            title="Open space left → right — every lead orbits the stage it's in now"
            className={`transition-colors ${
              layout === "flow" && view === "live"
                ? "text-os-accent font-bold"
                : "text-os-dim hover:text-os-muted"
            }`}
          >
            flow
          </button>
          <span className="text-os-dim">·</span>
          <button
            onClick={() => {
              setLayout("radial")
              setView("live")
              updateUrl(venture, "live", "radial", stage, selectedLeadId)
            }}
            title="Circle, outside → in — center is the purchase"
            className={`transition-colors ${
              layout === "radial" && view === "live"
                ? "text-os-accent font-bold"
                : "text-os-dim hover:text-os-muted"
            }`}
          >
            radial
          </button>
          <span className="mx-1 h-3 w-px bg-os-border" />
          <button
            onClick={() => {
              setView("live")
              updateUrl(venture, "live", layout, stage, selectedLeadId)
            }}
            className={`transition-colors ${
              view === "live" ? "text-os-accent font-bold" : "text-os-dim hover:text-os-muted"
            }`}
          >
            live funnel
          </button>
          <span className="text-os-dim">·</span>
          <button
            onClick={() => {
              setView("archive")
              updateUrl(venture, "archive", layout, stage, selectedLeadId)
            }}
            className={`transition-colors ${
              view === "archive" ? "text-os-accent font-bold" : "text-os-dim hover:text-os-muted"
            }`}
          >
            archive ({archivedToUse.length})
          </button>
        </span>
      </div>

      {/* The Visualizer Space or Archive View */}
      <section>
        <div className="rounded-lg border border-os-border bg-os-surface p-2">
          {view === "archive" ? (
            archivedToUse.length === 0 ? (
              <p className="py-6 text-center font-mono text-[11.5px] text-os-dim">
                Nothing decayed — no lead has sat quiet past {DECAY_DAYS} days.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
                      <th className="px-3 pb-1 pt-2 font-normal">Lead</th>
                      <th className="px-3 pb-1 pt-2 font-normal">Reached</th>
                      <th className="px-3 pb-1 pt-2 font-normal">Quiet</th>
                      <th className="px-3 pb-1 pt-2 font-normal">Likelihood</th>
                      <th className="px-3 pb-1 pt-2 font-normal">Last touch</th>
                      <th className="px-3 pb-1 pt-2 font-normal" />
                    </tr>
                  </thead>
                  <tbody>
                    {archivedToUse.map((j) => {
                      const meta = journeyMeta(j, now)
                      const last = j.touches[j.touches.length - 1]
                      return (
                        <tr key={j.id} className="border-t border-os-border text-os-dim">
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2">
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full opacity-60"
                                style={{ background: ventureColor(j.venture) }}
                              />
                              <span className="truncate text-[12px] text-os-muted">{j.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide">
                            {FUNNEL_STAGES.find((s) => s.id === j.status)?.label ?? j.status}
                          </td>
                          <td className="px-3 py-2 font-mono text-[10.5px]">
                            {meta.daysSinceLastTouch}d
                          </td>
                          <td className="px-3 py-2 font-mono text-[10.5px]">{j.likelihood}%</td>
                          <td
                            className="max-w-[300px] truncate px-3 py-2 text-[11px]"
                            title={last?.label}
                          >
                            {last?.label ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {j.url && (
                              <a
                                href={j.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-[9.5px] uppercase tracking-wide text-os-dim hover:text-os-accent"
                              >
                                {j.url.includes("gohighlevel") ? "ghl ↗" : "attio ↗"}
                              </a>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : layout === "radial" ? (
            <FunnelRadial model={radialModel} initialLeadId={selectedLeadId} />
          ) : (
            <FunnelSpace nodes={spaceNodes} summary={summary} initialLeadId={selectedLeadId} />
          )}
        </div>
      </section>

      {/* Attention Queue (PUSH NOW / SAVE NOW) */}
      {view === "live" && (attention.pushNow.length > 0 || attention.saveNow.length > 0) && (
        <AttentionQueue
          pushNow={attention.pushNow}
          saveNow={attention.saveNow}
          now={now}
          onSelect={(leadId) => {
            setSelectedLeadId(leadId)
            updateUrl(venture, view, layout, stage, leadId)
          }}
        />
      )}

      {/* Journey Data Register */}
      <JourneyTable
        journeys={journeysToUse}
        now={now}
        stageCounts={stageCounts}
        commsFeed={commsFeed}
        initialStage={stage}
        onStageSelect={(newStage) => {
          setStage(newStage)
          updateUrl(venture, view, layout, newStage, selectedLeadId)
        }}
      />
    </div>
  )
}
