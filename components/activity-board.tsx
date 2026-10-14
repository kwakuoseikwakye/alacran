"use client"

import React, { useState } from "react"
import { FileText } from "lucide-react"
import type { Activity } from "@/lib/adapters/types"
import { getActivityDetail } from "@/lib/get-activity-detail"
import { groupActivitiesByDay } from "@/lib/group-activities-by-day"

/**
 * The activity log as a two-pane timeline: every run on the left, the selected
 * one's output on the right.
 *
 * It was a list of collapsible day groups that opened a Sheet over the page.
 * A Sheet is the wrong shape for something you read several of in a row —
 * comparing two runs meant closing and reopening, and the list you were working
 * through was hidden behind the thing you opened from it. Same reasoning that
 * made the Skills page a two-pane explorer in v73.
 *
 * **No status colour, deliberately.** `ActivityStatus` has exactly one value,
 * `"done"` — there is no failure state recorded anywhere for these. A severity
 * stripe here would be a legend for a distinction the data does not draw.
 *
 * `components/activity-day-group.tsx` was deleted rather than reused: its whole
 * job was collapsing a day, and a sticky header does that better without
 * hiding rows behind a click.
 */
export function ActivityBoard({
  activities,
  agentNames,
}: {
  activities: Activity[]
  /** agentId -> display name, for the filter and the row's second line. */
  agentNames: Record<string, string>
}) {
  const [selected, setSelected] = useState<Activity | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [company, setCompany] = useState<string | null>(null)

  async function open(activity: Activity) {
    setSelected(activity)
    setDetail(null)
    setDetailError(null)
    const result = await getActivityDetail(activity.detailPath)
    if (result.ok) setDetail(result.content)
    else setDetailError(result.message)
  }

  // Only companies that actually appear — a filter offering a company with
  // nothing in the log is a control that can only ever empty the list.
  const presentIds = [...new Set(activities.map((a) => a.agentId))]
  const visible = company ? activities.filter((a) => a.agentId === company) : activities
  const dayGroups = groupActivitiesByDay(visible)

  const chip = (id: string | null, label: string) => (
    <button
      key={id ?? "all"}
      onClick={() => setCompany(id)}
      aria-pressed={company === id}
      className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors ${
        company === id
          ? "border-os-accent/40 bg-[var(--accent-soft)] text-os-accent font-semibold"
          : "border-os-border bg-os-surface text-os-muted hover:border-os-border-strong hover:text-os-text hover:bg-os-surface2"
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="grid gap-4 pb-12 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <aside className="flex flex-col rounded-xl border border-os-border bg-os-surface overflow-hidden shadow-xs">
        {presentIds.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-os-border bg-os-surface2/40 p-3">
            {chip(null, "All companies")}
            {presentIds.map((id) => chip(id, agentNames[id] ?? id))}
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto">
          {dayGroups.length === 0 && (
            <p className="p-4 text-xs text-os-dim">Nothing has run yet.</p>
          )}
          {dayGroups.map((group) => (
            <div key={group.key}>
              {/* Sticky rather than collapsible: the day is a landmark you
                  scroll past, not a folder you open. */}
              <p className="sticky top-0 z-10 border-b border-os-border bg-os-surface2/90 backdrop-blur-xs px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-os-dim">
                {group.label}
              </p>
              {group.activities.map((activity) => {
                const active = selected?.id === activity.id
                return (
                  <button
                    key={activity.id}
                    onClick={() => open(activity)}
                    className={`group flex w-full flex-col gap-1 border-b border-os-border px-3.5 py-2.5 text-left transition-colors ${
                      active
                        ? "border-l-2 border-l-os-accent bg-[var(--accent-soft)] pl-[12px]"
                        : "hover:bg-os-surface2"
                    }`}
                  >
                    <span className={`truncate text-xs font-medium ${active ? "text-os-accent font-semibold" : "text-os-text"}`}>
                      {activity.title}
                    </span>
                    <span className="font-mono text-xs text-os-dim">
                      {agentNames[activity.agentId] ?? activity.agentId} ·{" "}
                      {new Date(activity.timestamp * 1000).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </aside>

      <section className="min-w-0 rounded-xl border border-os-border bg-os-surface overflow-hidden shadow-xs">
        {!selected ? (
          <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-2 p-8 text-center">
            <FileText className="size-6 text-os-dim" />
            <p className="text-sm font-medium text-os-text">Pick a run to read what it wrote</p>
            <p className="max-w-xs text-xs text-os-muted">
              Every action every agent has taken on this computer, newest first.
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-os-border bg-os-surface2/30 p-4">
              <h2 className="min-w-0 truncate font-display text-lg font-bold text-os-text">{selected.title}</h2>
              <p className="mt-1 font-mono text-xs text-os-dim">
                {agentNames[selected.agentId] ?? selected.agentId} ·{" "}
                {new Date(selected.timestamp * 1000).toLocaleString()}
              </p>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              {detailError && (
                <p className="rounded-lg border border-os-err/40 bg-os-err/10 p-4 text-sm text-os-err">{detailError}</p>
              )}
              {!detailError && (
                <pre className="whitespace-pre-wrap rounded-lg border border-os-border bg-os-surface2/50 p-4 font-mono text-xs text-os-text selection:bg-os-accent/20">
                  {detail ?? "Loading…"}
                </pre>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
