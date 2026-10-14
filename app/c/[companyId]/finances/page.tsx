import type { ComponentType } from "react"
import { ExecutorGapNote } from "@/components/executor-gap-note"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { readRunwayRecord } from "@/lib/finances/runway"
import { listRecommendations } from "@/lib/finances/recommendations"
import { resolveDepartmentConnectors } from "@/lib/os/departments/connectors"
import { AuditFinancesForm } from "@/components/finances/audit-finances-form"
import { RunwayPulseBar } from "@/components/finances/runway-pulse-bar"
import { RecommendationList } from "@/components/finances/recommendation-list"
import { CreditCard, Landmark, Calculator, Receipt } from "lucide-react"

export const dynamic = "force-dynamic"

const TOOL_DEFINITIONS: Record<
  string,
  {
    label: string
    description: string
    icon: ComponentType<{ className?: string }>
  }
> = {
  stripe: {
    label: "Stripe",
    description: "Payment processing, customer billing, and subscriptions",
    icon: CreditCard,
  },
  mercury: {
    label: "Mercury",
    description: "Bank accounts, treasury balances, and wire transfers",
    icon: Landmark,
  },
  quickbooks: {
    label: "QuickBooks",
    description: "Accounting ledger, expenses, invoices, and tax categories",
    icon: Calculator,
  },
  brex: {
    label: "Brex",
    description: "Corporate cards, spend limits, and credit balances",
    icon: Receipt,
  },
}

export default async function FinancesPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) notFound()

  const [runway, recommendations, connectors] = await Promise.all([
    readRunwayRecord(agent.rootPath),
    listRecommendations(agent.rootPath),
    resolveDepartmentConnectors(
      [
        { id: "stripe", label: "Stripe" },
        { id: "mercury", label: "Mercury" },
        { id: "quickbooks", label: "QuickBooks" },
        { id: "brex", label: "Brex" },
      ],
      { companyPath: agent.rootPath }
    ),
  ])

  const pending = recommendations.filter((r) => r.status === "pending")
  const ready = recommendations.filter((r) => r.status === "approved")
  const realized = recommendations
    .filter((r) => r.status === "realized")
    .sort((a, b) => {
      const diff = b.potentialSavingsMonthly - a.potentialSavingsMonthly
      if (diff !== 0) return diff
      return b.date.localeCompare(a.date)
    })

  const currencySymbol = runway.currency === "USD" ? "$" : `${runway.currency} `

  return (
    <main className="dash-content space-y-8 pb-12" aria-labelledby="finances-title">
      <header>
        <h1 id="finances-title" className="text-3xl font-semibold text-foreground">
          Finances & cash runway
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alacrán audits company spend, calculates cash runway, and drafts vendor cost-reduction opportunities. Nothing is changed without you.
        </p>
      </header>

      {/* 1. Connected Tools */}
      <section aria-labelledby="finances-tools" className="space-y-3">
        <h2 id="finances-tools" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
          Connected tools
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {connectors.map((c) => {
            const def = TOOL_DEFINITIONS[c.id] || {
              label: c.label,
              description: "Financial connector",
              icon: CreditCard,
            }
            const Icon = def.icon
            const isConnected = c.status === "connected"
            const isError = c.status === "error"

            return (
              <div
                key={c.id}
                className="flex items-center justify-between p-4 rounded-xl border border-os-border bg-os-surface"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <Icon
                    className={`h-5 w-5 shrink-0 ${isConnected ? "text-os-accent" : "text-muted-foreground"}`}
                  />
                  <div className="min-w-0">
                    <strong className="block text-sm font-medium text-foreground truncate">
                      {def.label}
                    </strong>
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {def.description}
                    </span>
                  </div>
                </div>

                {isConnected ? (
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                    Ready
                  </span>
                ) : isError ? (
                  <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 shrink-0">
                    Error
                  </span>
                ) : (
                  <span className="text-xs font-mono text-muted-foreground bg-muted/20 px-2 py-0.5 rounded border border-os-border shrink-0">
                    Available
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* 2. Audit spend & cash runway */}
      <section aria-labelledby="finances-jobs" className="space-y-3">
        <h2 id="finances-jobs" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
          Audit spend & cash runway
        </h2>
        <AuditFinancesForm
          companyId={agent.id}
          initialCash={runway.cashBalance}
          initialBurn={runway.monthlyBurn}
        />
        <ExecutorGapNote agentId={agent.id} need="outside-text" />
      </section>

      {/* 3. Runway pulse & Waiting for you */}
      <section aria-labelledby="finances-waiting" className="space-y-3">
        <h2 id="finances-waiting" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
          Runway pulse & Waiting for you {pending.length > 0 && `(${pending.length})`}
        </h2>
        <div className="space-y-4">
          <RunwayPulseBar metrics={runway} />
          <RecommendationList
            recommendations={pending}
            companyId={agent.id}
            empty="Nothing waiting. Run a financial audit above to discover savings opportunities."
          />
        </div>
      </section>

      {/* 4. Ready to act */}
      <section aria-labelledby="finances-ready" className="space-y-3">
        <h2 id="finances-ready" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
          Ready to act {ready.length > 0 && `(${ready.length})`}
        </h2>
        <RecommendationList
          recommendations={ready}
          companyId={agent.id}
          empty="Approved recommendations appear here, ready for outreach, plan changes, or cancellations."
        />
      </section>

      {/* 5. What Alacrán remembers */}
      <section aria-labelledby="finances-memory" className="space-y-3">
        <h2 id="finances-memory" className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
          What Alacrán remembers
        </h2>
        <div className="rounded-xl border border-os-border bg-os-surface p-5 text-sm space-y-4">
          {realized.length === 0 && runway.realizedSavingsMonthly === 0 ? (
            <p className="text-muted-foreground italic">
              Recommendations marked as realized and audited financial baselines are remembered here, keeping runway metrics up to date.
            </p>
          ) : (
            <div className="space-y-3">
              {runway.realizedSavingsMonthly > 0 && (
                <div className="flex items-center justify-between pb-2 border-b border-os-border/50 text-xs">
                  <span className="text-muted-foreground font-medium">Total Realized Cost Reduction</span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {`+${currencySymbol}${runway.realizedSavingsMonthly.toLocaleString()}/mo (${currencySymbol}${runway.realizedSavingsAnnual.toLocaleString()}/yr)`}
                  </span>
                </div>
              )}
              {realized.length > 0 && (
                <ul className="divide-y divide-os-border/50">
                  {realized.map((r) => (
                    <li key={r.fileName} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-foreground font-medium">{r.vendor}</strong>
                        <span className="text-muted-foreground ml-2">({r.title})</span>
                      </div>
                      <span className="font-mono text-emerald-400">
                        {`+${r.currency === "USD" ? "$" : `${r.currency} `}${r.potentialSavingsMonthly.toLocaleString()}/mo realized`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="pt-2 flex items-center justify-between border-t border-os-border/60 text-xs">
            <span className="text-muted-foreground">Canonical index: records/finances/runway.yaml</span>
            <Link href={`/c/${agent.id}/files?path=records/finances`} className="text-os-accent hover:underline">
              Inspect raw files →
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
