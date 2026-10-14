import type { ContentMetrics } from "@/lib/os/departments/metrics"
import type { ContentItem } from "@/lib/os/schemas/content"

export function ContentHero({
  metrics,
  items,
}: {
  metrics: ContentMetrics
  items: ContentItem[]
}) {
  const pipelineStages = [
    { id: "idea", label: "Idea" },
    { id: "draft", label: "Draft" },
    { id: "review", label: "Review" },
    { id: "scheduled", label: "Scheduled" },
    { id: "published", label: "Published" },
    { id: "archived", label: "Archived" },
  ]

  const maxStageCount = Math.max(
    ...pipelineStages.map((s) => metrics.statusBreakdown[s.id] ?? 0),
    1
  )

  const channels = Object.entries(metrics.channelBreakdown)

  return (
    <div className="space-y-6">
      {/* 4 Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Total Pieces
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-foreground">
            {metrics.totalItems}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Across all content pipelines</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Published
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-emerald-400">
            {metrics.publishedCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Live articles, posts, & newsletters</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            Scheduled
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-sky-400">
            {metrics.scheduledCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Queued for upcoming release</p>
        </div>

        <div className="p-4 rounded border border-border bg-card/40">
          <p className="text-xs text-muted-foreground uppercase font-mono tracking-wider">
            In Production
          </p>
          <p className="text-2xl font-bold font-mono mt-1 text-amber-400">
            {metrics.inProgressCount}
          </p>
          <p className="text-xs text-muted-foreground mt-1">In idea, drafting, or review</p>
        </div>
      </div>

      {/* Production Pipeline */}
      <div className="p-5 rounded border border-border bg-card/20 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Production Pipeline</h3>
          <span className="text-xs text-muted-foreground font-mono">
            {items.length} recorded items
          </span>
        </div>

        <div className="space-y-3">
          {pipelineStages.map((stage) => {
            const count = metrics.statusBreakdown[stage.id] ?? 0
            const percentage = (count / maxStageCount) * 100

            return (
              <div key={stage.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{stage.label}</span>
                  <span className="font-mono font-bold text-foreground">
                    {count} {count === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full bg-primary/80 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(percentage, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Channel Breakdown */}
      <div className="p-5 rounded border border-border bg-card/20 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Distribution by Channel</h3>
          <span className="text-xs text-muted-foreground font-mono">
            {channels.length} active channels
          </span>
        </div>

        {channels.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            No content distribution channels recorded yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {channels.map(([channel, count]) => (
              <div
                key={channel}
                className="p-3 rounded border border-border/60 bg-muted/10 space-y-1"
              >
                <span className="text-xs font-semibold capitalize text-foreground">
                  {channel}
                </span>
                <p className="text-sm font-bold font-mono text-foreground">
                  {count} <span className="text-xs font-normal text-muted-foreground">pieces</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
