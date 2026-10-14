export default function CompanyLoading() {
  return (
    <div className="dash-content space-y-6 animate-pulse select-none p-6">
      {/* PageHeader skeleton */}
      <div className="flex flex-col gap-2 pb-5 border-b border-os-border/50">
        <div className="h-2.5 w-24 rounded bg-os-surface2/80" />
        <div className="flex justify-between items-center">
          <div className="h-7 w-56 rounded bg-os-surface2" />
          <div className="flex gap-2">
            <div className="h-8 w-24 rounded bg-os-surface2/60" />
            <div className="h-8 w-24 rounded bg-os-surface2/60" />
          </div>
        </div>
        <div className="h-3.5 w-80 rounded bg-os-surface2/40 mt-1" />
      </div>

      {/* Metric / Stat cards row skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-os-border/50 bg-os-surface/40 p-4 space-y-3"
          >
            <div className="flex justify-between items-center">
              <div className="h-3 w-20 rounded bg-os-surface2/60" />
              <div className="h-4 w-4 rounded bg-os-surface2/40" />
            </div>
            <div className="h-7 w-32 rounded bg-os-surface2/80" />
            <div className="h-2.5 w-28 rounded bg-os-surface2/40" />
          </div>
        ))}
      </div>

      {/* Main content stage skeleton */}
      <div className="rounded-lg border border-os-border/50 bg-os-surface/30 p-6 min-h-[380px] flex flex-col justify-between space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-os-border/40">
          <div className="h-4 w-40 rounded bg-os-surface2/70" />
          <div className="h-6 w-28 rounded bg-os-surface2/50" />
        </div>
        <div className="flex-1 flex flex-col justify-center items-center py-12 gap-3 opacity-60">
          <div className="h-8 w-8 rounded-full border-2 border-os-accent/40 border-t-os-accent animate-spin" />
          <div className="h-3 w-32 rounded bg-os-surface2/70 font-mono text-[11px] text-os-dim" />
        </div>
        <div className="flex gap-3 pt-4 border-t border-os-border/30">
          <div className="h-3 w-24 rounded bg-os-surface2/40" />
          <div className="h-3 w-36 rounded bg-os-surface2/40" />
        </div>
      </div>
    </div>
  )
}
