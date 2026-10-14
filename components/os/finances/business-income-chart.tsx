"use client"

import { useState } from "react"
import type { BusinessIncomeSeries } from "@/lib/os/departments/adapters/finances-adapter"

const RANGES: { label: string; value: number | "all" }[] = [
  { label: "30 days", value: 1 },
  { label: "60 days", value: 2 },
  { label: "3 months", value: 3 },
  { label: "6 months", value: 6 },
  { label: "12 months", value: 12 },
  { label: "All time", value: "all" },
]

type Metric = "in" | "out" | "net"

const METRICS: { label: string; value: Metric }[] = [
  { label: "Money in", value: "in" },
  { label: "Money out", value: "out" },
  { label: "Net after out", value: "net" },
]

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

const signedUsd = (n: number) => `${n < 0 ? "−" : "+"}${usd(Math.abs(n))}`

const fmtMonth = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })

export function BusinessIncomeChart({ series }: { series: BusinessIncomeSeries }) {
  const [range, setRange] = useState<number | "all">("all")
  const [metric, setMetric] = useState<Metric>("in")
  const [hovered, setHovered] = useState<string | null>(null)

  const shown = range === "all" ? series.points : series.points.slice(-range)
  const total = shown.reduce((s, p) => s + p.amount, 0)
  const max = Math.max(1, ...shown.map((p) => Math.abs(p.amount)))

  const headlineClass =
    metric === "in"
      ? "text-os-ok"
      : metric === "out"
      ? "text-os-err"
      : total >= 0
      ? "text-os-ok"
      : "text-os-err"

  return (
    <div className="rounded-lg border border-os-border bg-os-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-os-text">{series.business}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-os-dim">
            {metric === "in"
              ? "income · bank deposits"
              : metric === "out"
              ? "outflow · bank debits"
              : "net · after money out"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            className="rounded-xs border border-os-border bg-os-surface px-2 py-1 font-mono text-[10px] text-os-text focus:border-os-border-strong focus:outline-none"
          >
            {METRICS.map((m) => (
              <option key={m.value} value={m.value} className="bg-os-surface text-os-text">
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={String(range)}
            onChange={(e) =>
              setRange(e.target.value === "all" ? "all" : Number(e.target.value))
            }
            className="rounded-xs border border-os-border bg-os-surface px-2 py-1 font-mono text-[10px] text-os-text focus:border-os-border-strong focus:outline-none"
          >
            {RANGES.map((r) => (
              <option key={r.label} value={String(r.value)} className="bg-os-surface text-os-text">
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-mono text-[26px] font-semibold tracking-[-0.02em] ${headlineClass}`}>
          {metric === "net" && total < 0 ? `−${usd(Math.abs(total))}` : usd(total)}
        </span>
        <span className="font-mono text-[11px] text-os-dim">
          {metric === "in" ? "total deposits" : metric === "out" ? "total debits" : "net balance"}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="mt-4 font-mono text-[11px] text-os-dim">no statements in range</div>
      ) : (
        <div className="mt-4 flex items-end gap-1.5" style={{ height: 104 }}>
          {shown.map((m) => {
            const hot = hovered === m.date
            const val = m.amount
            const h = Math.max(2, (Math.abs(val) / max) * 76)
            const barClass =
              metric === "in"
                ? "bg-os-accent"
                : metric === "out"
                ? "bg-os-err"
                : val >= 0
                ? "bg-os-ok"
                : "bg-os-err"

            return (
              <div
                key={m.date}
                className="flex flex-1 flex-col items-center gap-1"
                onMouseEnter={() => setHovered(m.date)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="relative flex w-full items-end justify-center" style={{ height: 84 }}>
                  {hot && (
                    <span
                      className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-xs border border-os-border bg-os-surface2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-os-text"
                      style={{ bottom: `${h + 6}px` }}
                    >
                      {metric === "net" ? signedUsd(val) : usd(val)}
                    </span>
                  )}
                  <div
                    className={`w-full max-w-[28px] rounded-xs transition-[opacity,filter] duration-150 ${barClass}`}
                    style={{ height: `${h}px`, opacity: hot ? 1 : hovered ? 0.45 : 0.8 }}
                  />
                </div>
                <span
                  className={`font-mono text-[9px] transition-colors duration-150 ${
                    hot ? "text-os-text" : "text-os-dim"
                  }`}
                >
                  {fmtMonth(m.date)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
