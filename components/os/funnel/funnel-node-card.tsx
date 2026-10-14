"use client"

import React from "react"
import {
  CHANNEL_GLYPHS,
  FUNNEL_STAGES,
  STALL_DAYS,
  originOf,
  contactActions,
  type FunnelSpaceNode,
} from "@/lib/os/departments/adapters/funnel-adapter"

const RELATIONSHIP_COLOR = {
  hot: "var(--os-accent, #3df08c)",
  warm: "#38bdf8",
  cold: "var(--os-dim, #6b7280)",
} as const

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

export function FunnelNodeCard({
  node,
  onClose,
}: {
  node: FunnelSpaceNode
  onClose: () => void
}) {
  const who = node.person ?? node.name
  const stageLabel = FUNNEL_STAGES.find((s) => s.id === node.status)?.label ?? node.status
  const origin = originOf(node)
  const actions = contactActions(node)
  const isGhl = node.url?.includes("gohighlevel")

  return (
    <div className="absolute right-3 top-3 z-20 flex max-h-[calc(100%-24px)] w-[340px] flex-col overflow-y-auto rounded-lg border border-os-border-strong bg-os-surface2 p-4 shadow-xl select-text">
      {/* WHO */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-os-text">{who}</div>
          {(node.role || node.company) && (
            <div className="mt-0.5 truncate text-[11px] text-os-muted">
              {node.role}
              {node.role && node.company ? " @ " : ""}
              {node.company}
            </div>
          )}
          <div className="mt-0.5 truncate font-mono text-[9.5px] uppercase tracking-wide text-os-dim">
            {node.venture === "vantage" ? "Vantage" : "Launchpad Cohort"} · {stageLabel}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 font-mono text-[14px] text-os-dim hover:text-os-text"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* status strip */}
      <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-os-border pt-2 font-mono text-[10px]">
        <div>
          <div className="text-os-dim">likelihood</div>
          <div className="text-[12px] font-semibold text-os-text">{node.likelihood}%</div>
        </div>
        <div>
          <div className="text-os-dim">relationship</div>
          <div
            className="text-[12px] font-semibold capitalize"
            style={{ color: RELATIONSHIP_COLOR[node.relationship] }}
          >
            {node.relationship}
          </div>
        </div>
        <div>
          <div className="text-os-dim">quiet for</div>
          <div
            className="text-[12px] font-semibold"
            style={
              node.decay > 0
                ? {
                    color: `color-mix(in oklab, var(--os-err, #f43f5e) ${Math.round(
                      Math.sqrt(node.decay) * 85
                    )}%, var(--os-text, #fff))`,
                  }
                : node.state === "stalled"
                ? { color: "var(--os-err, #f43f5e)" }
                : undefined
            }
          >
            {node.daysSinceLastTouch}d
          </div>
        </div>
      </div>

      {node.state === "converted" && (
        <div className="mt-2 rounded-xs border border-os-ok/30 bg-os-ok/10 px-2 py-1 font-mono text-[10px] text-os-ok">
          {node.product ? `${node.product} · ` : ""}Converted · {usd(node.amountUsd ?? 0)}
        </div>
      )}
      {node.state !== "converted" && (node.amountUsd ?? 0) > 0 && (
        <div className="mt-2 font-mono text-[10px] text-os-muted">
          deal value · {usd(node.amountUsd ?? 0)}
        </div>
      )}
      {node.state === "stalled" && (
        <div className="mt-2 rounded-xs border border-os-err/30 bg-os-err/10 px-2 py-1 font-mono text-[10px] text-os-err">
          stalled — quiet past {STALL_DAYS}d
        </div>
      )}

      {/* ORIGIN */}
      <div className="mt-2.5 border-t border-os-border pt-2 font-mono text-[10px]">
        <div className="mb-1 text-[8.5px] uppercase tracking-[0.24em] text-os-dim">origin</div>
        <div className="flex items-baseline gap-2 text-[11px]">
          <span className="shrink-0 font-semibold text-os-text">{origin.segment}</span>
          {origin.at && <span className="shrink-0 text-[9.5px] text-os-dim">{origin.at}</span>}
          {origin.source && (
            <span className="shrink-0 rounded-xs border border-os-border px-1 text-[8.5px] uppercase tracking-wide text-os-dim">
              {origin.source}
            </span>
          )}
        </div>
        {origin.entry && (
          <div className="mt-0.5 truncate text-[10.5px] text-os-muted" title={origin.entry}>
            {origin.entry}
          </div>
        )}
      </div>

      {/* HOW TO REACH THEM */}
      <div className="mt-2.5 border-t border-os-border pt-2 font-mono text-[10px]">
        <div className="mb-1 text-[8.5px] uppercase tracking-[0.24em] text-os-dim">contact</div>
        <div className="flex flex-col gap-1 text-[10.5px]">
          {actions.email && (
            <div className="flex items-baseline gap-2">
              <span className="w-10 shrink-0 uppercase tracking-wide text-os-dim">email</span>
              <a href={`mailto:${actions.email}`} className="truncate text-os-accent hover:underline">
                {actions.email}
              </a>
            </div>
          )}
          {actions.phone && (
            <div className="flex items-baseline gap-2">
              <span className="w-10 shrink-0 uppercase tracking-wide text-os-dim">phone</span>
              <a href={`tel:${actions.phone}`} className="truncate text-os-accent hover:underline">
                {actions.phone}
              </a>
            </div>
          )}
          {(actions.wa || actions.sms || actions.crmUrl) && (
            <div className="mt-1 flex items-center gap-3 text-[9.5px] uppercase tracking-wide">
              {actions.wa && (
                <a
                  href={actions.wa}
                  target="_blank"
                  rel="noreferrer"
                  className="text-os-muted hover:text-os-accent"
                >
                  whatsapp
                </a>
              )}
              {actions.sms && (
                <a href={actions.sms} className="text-os-muted hover:text-os-accent">
                  sms
                </a>
              )}
              {actions.crmUrl && (
                <a
                  href={actions.crmUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-os-dim hover:text-os-accent"
                >
                  {isGhl ? "ghl ↗" : "attio ↗"}
                </a>
              )}
            </div>
          )}
          {!actions.email && !actions.phone && !actions.crmUrl && (
            <div className="text-[10px] text-os-dim">no contact info on record</div>
          )}
        </div>
      </div>

      {/* journey trail */}
      <div className="mt-2.5 border-t border-os-border pt-2 font-mono text-[10px]">
        <div className="mb-1 text-[8.5px] uppercase tracking-[0.24em] text-os-dim">
          journey touches ({node.touches.length})
        </div>
        <ol className="flex flex-col gap-1">
          {node.touches.map((t) => (
            <li key={t.id} className="flex items-baseline gap-1.5 text-[10.5px] text-os-muted">
              <span className="shrink-0 text-os-accent">{CHANNEL_GLYPHS[t.channel] ?? "·"}</span>
              <span className="min-w-0 flex-1 truncate">{t.label}</span>
              <span className="shrink-0 text-[9px] text-os-dim">{t.at}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
