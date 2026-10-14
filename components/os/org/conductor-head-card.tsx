import type React from "react"
import { Cpu, Sparkles, Activity } from "lucide-react"

export type ConductorHeadCardProps = {
  title?: string
  name?: string
  status?: "active" | "idle" | "running"
  modelTag?: string
  routingStatus?: string
  className?: string
}

export function ConductorHeadCard({
  title = "AI Operations Lead",
  name = "Conductor",
  status = "active",
  modelTag = "Claude 3.7 Sonnet",
  routingStatus = "Autonomous Routing",
  className = "",
}: ConductorHeadCardProps) {
  return (
    <div
      className={`flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-4 shadow-sm transition-all duration-150 hover:border-os-border-strong hover:bg-os-surface2 ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded border border-os-border/80 bg-os-surface2 text-os-accent">
              <Cpu className="size-4" />
            </div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-os-dim">
              AI Command
            </span>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-os-surface3 border border-os-border/70 px-2 py-0.5">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--ok,#3df08c)] opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-[var(--ok,#3df08c)]" />
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider font-semibold text-[var(--ok,#3df08c)]">
              {status}
            </span>
          </div>
        </div>

        <div className="space-y-0.5">
          <h3 className="font-display text-sm font-semibold tracking-tight text-os-text truncate">
            {name}
          </h3>
          <p className="font-mono text-xs text-os-dim">{title}</p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-os-border/50 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded bg-os-surface3 border border-os-border px-1.5 py-0.5 font-mono text-[10px] text-os-dim">
          <Sparkles className="size-2.5 text-os-accent" />
          {modelTag}
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-os-surface3 border border-os-border px-1.5 py-0.5 font-mono text-[10px] text-os-dim">
          <Activity className="size-2.5 text-os-text-2" />
          {routingStatus}
        </span>
      </div>
    </div>
  )
}
