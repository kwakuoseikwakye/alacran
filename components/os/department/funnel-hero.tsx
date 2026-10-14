import type { FunnelMetrics } from "@/lib/os/departments/metrics"
import type { Lead, FunnelStage } from "@/lib/os/schemas/funnel"

export function FunnelHero({
  metrics,
  leads,
  stages,
}: {
  metrics: FunnelMetrics
  leads: Lead[]
  stages: FunnelStage[]
}) {
  const defaultStages = [
    { id: "new", name: "New" },
    { id: "qualified", name: "Qualified" },
    { id: "negotiation", name: "Negotiation" },
    { id: "won", name: "Won" },
    { id: "lost", name: "Lost" },
  ]
  const displayStages = stages.length > 0 ? stages : defaultStages

  const maxStageValue = Math.max(
    ...Object.values(metrics.stageBreakdown).map((s) => s.value),
    1
  )

  return (
    <div className="space-y-6">
      {/* 4 Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Pipeline Value
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            ${metrics.totalValue.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Across all open & won deals</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Active Deals
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            {metrics.activeLeadsCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">In qualification or negotiation</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Win Rate
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            {(metrics.winRate * 100).toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">{metrics.wonLeadsCount} won / {metrics.wonLeadsCount + metrics.lostLeadsCount} decided</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Avg Deal Size
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            ${Math.round(metrics.avgDealSize).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Across {leads.length} total leads</p>
        </div>
      </div>

      {/* Funnel Stage Visualization */}
      <div className="p-5 rounded border border-border bg-card/20 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Pipeline by Stage</h3>
          <span className="text-xs text-muted-foreground font-mono">{leads.length} recorded leads</span>
        </div>

        <div className="space-y-3">
          {displayStages.map((stage) => {
            const data = metrics.stageBreakdown[stage.id] ?? { count: 0, value: 0 }
            const percentage = (data.value / maxStageValue) * 100

            return (
              <div key={stage.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{stage.name}</span>
                  <div className="flex items-center gap-3 font-mono text-muted-foreground">
                    <span>{data.count} {data.count === 1 ? "deal" : "deals"}</span>
                    <span className="font-bold text-foreground">${data.value.toLocaleString()}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full bg-primary/80 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(percentage, data.count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
