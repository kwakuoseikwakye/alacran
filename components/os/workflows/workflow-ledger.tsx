import type { WorkflowStats } from "@/lib/os/workflows/stats"
import { formatUsdCompact } from "@/lib/os/workflows/stats"

export function WorkflowLedger({ stats }: { stats: WorkflowStats }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-os-border bg-os-surface px-5 py-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
          MANUAL LOAD
        </span>
        <span className="font-mono text-sm font-semibold text-os-text">
          {stats.manualHours}h / week
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
          BOTTLENECK LEAK
        </span>
        <span
          className={`font-mono text-sm font-semibold ${
            stats.totalLeak > 0 ? "text-os-err" : "text-os-text"
          }`}
        >
          {formatUsdCompact(stats.totalLeak)} / mo
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
          AUTOMATION RECOVERY
        </span>
        <span
          className={`font-mono text-sm font-semibold ${
            stats.totalRecovered > 0 ? "text-os-ok" : "text-os-text"
          }`}
        >
          +{formatUsdCompact(stats.totalRecovered)} / mo
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
          GATE CHECKPOINTS
        </span>
        <span
          className={`font-mono text-sm font-semibold ${
            stats.gateCount > 0 ? "text-os-warn" : "text-os-text"
          }`}
        >
          {stats.gateCount} guarded
        </span>
      </div>
    </div>
  )
}
