import React from "react"
import { Wallet, TrendingDown, Clock, Sparkles } from "lucide-react"
import type { RunwayMetrics } from "@/lib/finances/runway"

export function RunwayPulseBar({ metrics }: { metrics: RunwayMetrics }) {
  const currencySymbol = metrics.currency === "USD" ? "$" : `${metrics.currency} `

  const badgeColorClass =
    metrics.healthColor === "emerald"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : metrics.healthColor === "coral"
        ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
        : "bg-amber-500/15 text-amber-400 border-amber-500/30"

  const runwayDisplay =
    metrics.runwayMonths >= 999
      ? "Infinite"
      : `${metrics.runwayMonths} mo`

  return (
    <section className="rounded-xl border border-os-border bg-os-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Core Metric 1: Cash Balance */}
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-os-surface2 p-2.5 text-os-accent border border-os-border/50">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cash on hand</p>
            <p className="text-xl font-semibold font-mono text-foreground">
              {currencySymbol}{metrics.cashBalance.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Core Metric 2: Monthly Burn */}
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-os-surface2 p-2.5 text-muted-foreground border border-os-border/50">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monthly burn</p>
            <p className="text-xl font-semibold font-mono text-foreground">
              {currencySymbol}{metrics.monthlyBurn.toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground ml-1">/mo</span>
            </p>
          </div>
        </div>

        {/* Core Metric 3: Runway Health Pill */}
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-os-surface2 p-2.5 text-muted-foreground border border-os-border/50">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estimated runway</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeColorClass}`}>
                {runwayDisplay}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {metrics.healthLabel}
            </p>
          </div>
        </div>

        {/* Realized Savings Highlight (if any) */}
        {metrics.realizedSavingsMonthly > 0 && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 rounded-lg">
            <Sparkles className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-emerald-400">
                +{currencySymbol}{metrics.realizedSavingsMonthly.toLocaleString()}/mo
              </span>{" "}
              <span className="text-muted-foreground">
                realized ({currencySymbol}{metrics.realizedSavingsAnnual.toLocaleString()}/yr)
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
