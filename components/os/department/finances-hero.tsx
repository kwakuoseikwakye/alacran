import type { FinancialMetrics } from "@/lib/os/departments/metrics"
import type { Transaction } from "@/lib/os/schemas/finances"

export function FinancesHero({
  metrics,
  transactions,
}: {
  metrics: FinancialMetrics
  transactions: Transaction[]
}) {
  const isNetPositive = metrics.netBalance >= 0

  return (
    <div className="space-y-6">
      {/* 4 Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Net Balance
          </p>
          <p
            className={`text-2xl font-bold font-mono mt-1 ${
              isNetPositive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isNetPositive ? "+" : ""}${metrics.netBalance.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Inflow minus outflow</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Total Income
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-emerald-400">
            ${metrics.totalIncome.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Cleared customer & client receipts</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Total Expenses
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-red-400">
            ${metrics.totalExpense.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Hosting, vendors, & operations</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Pending Items
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            {metrics.pendingCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Awaiting bank or card clearance</p>
        </div>
      </div>

      {/* Categories Breakdown */}
      <div className="p-5 rounded border border-border bg-card/20 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Activity by Category</h3>
          <span className="text-xs text-muted-foreground font-mono">
            {transactions.length} recorded transactions
          </span>
        </div>

        {Object.keys(metrics.categoryBreakdown).length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No categorized transactions recorded yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(metrics.categoryBreakdown).map(([category, amounts]) => (
              <div key={category} className="p-3 rounded border border-border/60 bg-muted/10 space-y-1">
                <span className="text-xs font-semibold capitalize text-foreground">{category}</span>
                <div className="flex items-center justify-between text-xs font-mono">
                  {amounts.income > 0 && (
                    <span className="text-emerald-400">+${amounts.income.toLocaleString()}</span>
                  )}
                  {amounts.expense > 0 && (
                    <span className="text-red-400">-${amounts.expense.toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
