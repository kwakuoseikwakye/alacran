import React from "react"
import { ArrowDownLeft, ArrowUpRight, Scale, Landmark } from "lucide-react"
import type { FinancesViewModel } from "@/lib/os/departments/adapters/finances-adapter"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { Badge, Label, SectionHead, Dot } from "@/components/os/terminal"
import { SharePie } from "@/components/os/share-pie"
import { BusinessIncomeChart } from "./business-income-chart"
import { StatementUploader } from "./statement-uploader"

const usd = (n: number, cents = false) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents ? 2 : 0,
  })

function ago(unix: number): string {
  const mins = Math.round((Date.now() - unix * 1000) / 60_000)
  if (mins < 60) return `${Math.max(0, mins)}m`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function FinancesCockpit({
  model,
  companyId,
}: {
  model: FinancesViewModel
  companyId: string
}) {
  const {
    incomeMtd,
    expenses,
    netMonthly,
    isExpensesLive,
    monthLabel,
    stripeAvailable,
    stripePending,
    stripeLive,
    stripeMachineDefault,
    accounts,
    byCategory,
    recentCharges,
    bankSeries,
  } = model

  const liveCount = accounts.filter((a) => a.live).length
  const maxAccount = Math.max(...accounts.map((a) => a.income ?? 0), 1)
  const maxCategory = Math.max(...byCategory.map((c) => c.total), 1)

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Finances"
        right={
          <Badge tone={netMonthly >= 0 ? "ok" : "err"}>
            {netMonthly >= 0 ? "+" : "−"}
            {usd(Math.abs(netMonthly))} net /mo
          </Badge>
        }
      />

      {/* Summary tiles — slim single-line rows so the page opens condensed */}
      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-lg border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Income · MTD</Label>
            <ArrowDownLeft className="h-3 w-3 text-os-ok" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] text-os-ok">
              {usd(incomeMtd)}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
              {liveCount}/{accounts.length} live
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Expenses · /mo</Label>
            <ArrowUpRight className="h-3 w-3 text-os-err" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] text-os-text">
              {usd(expenses)}
            </span>
            <span
              className={`min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] ${
                isExpensesLive ? "text-os-ok" : "text-os-warn"
              }`}
            >
              {isExpensesLive ? `records · ${monthLabel ?? "current"}` : "no records"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Net · /mo</Label>
            <Scale className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] ${
                netMonthly >= 0 ? "text-os-ok" : "text-os-err"
              }`}
            >
              {netMonthly >= 0 ? "" : "−"}
              {usd(Math.abs(netMonthly))}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
              in − out
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-os-border bg-os-surface px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Stripe balance</Label>
            <Landmark className="h-3 w-3 text-os-accent" strokeWidth={1.8} />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[16px] font-semibold leading-none tracking-[-0.02em] text-os-text">
              {stripeLive ? usd(stripeAvailable, true) : "—"}
            </span>
            <span className="min-w-0 truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-os-dim">
              {stripeLive
                ? `${usd(stripePending, true)} pending`
                : stripeMachineDefault
                  ? "machine key only"
                  : "connect Stripe"}
            </span>
          </div>
        </div>
      </section>

      {/* Income by business (when series exist) */}
      {bankSeries.length > 0 && (
        <section>
          <SectionHead label="Income · by business" count="bank deposits" />
          <div className="grid gap-3.5 lg:grid-cols-2">
            {bankSeries.map((s) => (
              <BusinessIncomeChart key={s.business} series={s} />
            ))}
          </div>
        </section>
      )}

      {/* Monthly expenses by category */}
      <section>
        <SectionHead
          label="Monthly expenses · by category"
          count={isExpensesLive && monthLabel ? `${usd(expenses)} · ${monthLabel}` : `${usd(expenses)} /mo`}
        />
        <div className="grid items-stretch gap-3.5 lg:grid-cols-[1.15fr_1fr_0.85fr]">
          {/* SharePie SVG donut */}
          <SharePie
            items={byCategory.map((c) => ({
              key: c.category,
              label: c.category,
              value: Math.round(c.total * 100),
            }))}
            total={Math.round(expenses * 100)}
            centerLabel={isExpensesLive && monthLabel ? monthLabel : "per month"}
            format={(cents) => usd(cents / 100)}
            donutPx={190}
            ariaLabel="Monthly expenses by category"
          />

          {/* Progress bar list */}
          <div className="rounded-lg border border-os-border bg-os-surface p-4">
            {byCategory.length === 0 ? (
              <div className="flex h-full items-center justify-center font-mono text-[11px] text-os-dim">
                No categorized expenses this month
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {byCategory.map((c) => (
                  <div key={c.category}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 font-mono text-[11px]">
                      <span className="text-os-muted">{c.category}</span>
                      <span className="text-os-text">{usd(c.total)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-xs bg-os-surface2">
                      <div
                        className="h-full bg-os-accent opacity-60"
                        style={{ width: `${(c.total / maxCategory) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Statement ingestion uploader */}
          <StatementUploader companyId={companyId} />
        </div>
      </section>

      {/* Income by processor */}
      <section>
        <SectionHead label="Income · by processor" count={`${liveCount}/${accounts.length} live`} />
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-os-border bg-os-surface px-4 py-3 transition-colors hover:border-os-border-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-semibold text-os-text">{a.label}</div>
                  <div className="mt-0.5 font-mono text-[9.5px] text-os-dim">{a.processor}</div>
                </div>
                {a.live ? (
                  <Badge tone="ok">
                    <Dot state="ok" pulse /> live
                  </Badge>
                ) : a.machineDefault ? (
                  <Badge tone="warn">machine key</Badge>
                ) : a.configured ? (
                  <Badge tone="warn">key set</Badge>
                ) : (
                  <Badge ghost>connect →</Badge>
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-mono text-[18px] font-semibold tracking-[-0.02em] text-os-text">
                  {a.income != null ? usd(a.income) : "—"}
                </span>
                <span className="font-mono text-[9.5px] text-os-dim">
                  {a.live
                    ? "this month"
                    : a.machineDefault
                      ? "not this company's key"
                      : a.configured
                        ? "pull pending"
                        : "awaiting key"}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-xs bg-os-surface2">
                <div
                  className="h-full bg-os-accent opacity-60"
                  style={{ width: `${a.income != null ? (a.income / maxAccount) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent income charges */}
      {recentCharges.length > 0 && (
        <section>
          <SectionHead label="Recent income" count="transactions · cleared" />
          <ul className="space-y-1.5">
            {recentCharges.map((c, i) => (
              <li
                key={`${c.created}-${i}`}
                className="flex items-center gap-3.5 rounded-lg border border-os-border bg-os-surface px-4 py-3"
              >
                <span className="font-mono text-[15px] font-semibold text-os-ok">
                  +{usd(c.amount)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-os-muted">
                  {c.description}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-os-dim">
                  {ago(c.created)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
