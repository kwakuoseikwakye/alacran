import Link from "next/link"
import { Bot, User, Clock, ShieldAlert, TriangleAlert, Zap } from "lucide-react"
import type { WorkflowStep } from "@/lib/os/schemas/workflows"
import { formatUsdCompact } from "@/lib/os/workflows/stats"

export function StepCard({
  step,
  companyId,
}: {
  step: WorkflowStep
  companyId: string
}) {
  const isLeaking = step.leak_usd != null && step.leak_usd > 0

  return (
    <div
      className={`w-[240px] shrink-0 flex flex-col gap-2 rounded-xl border p-3 ${
        isLeaking
          ? "border-os-err/40 bg-os-err/[0.04]"
          : "border-os-border bg-os-surface"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-1.5">
        <h4 className="text-[13px] font-semibold leading-tight text-os-text">
          {step.title}
        </h4>
        {isLeaking && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded bg-os-err/10 border border-os-err/25 px-1.5 py-0.5 text-[10px] font-mono text-os-err font-medium">
            <TriangleAlert className="h-3 w-3 shrink-0" />
            <span>leak {formatUsdCompact(step.leak_usd!)}/mo</span>
          </span>
        )}
      </div>

      {/* Owner Row */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {step.owner_kind === "agent" ? (
            <Bot className="h-3.5 w-3.5 text-os-accent shrink-0" />
          ) : (
            <User className="h-3.5 w-3.5 text-os-muted shrink-0" />
          )}
          <span className="truncate text-os-muted">{step.owner}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-os-dim font-mono text-[11px]">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{step.hours_per_week}h/wk</span>
        </div>
      </div>

      {/* Tools Chips */}
      {step.tools && step.tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {step.tools.map((tool) => (
            <span
              key={tool}
              className="rounded bg-os-surface2 px-1.5 py-0.5 font-mono text-[10px] text-os-dim border border-os-border/50"
            >
              {tool}
            </span>
          ))}
        </div>
      )}

      {/* Human Gate Shield */}
      {step.gate_checkpoint && (
        <Link
          href={`/c/${companyId}/tasks`}
          className="inline-flex items-center gap-1.5 rounded-md border border-os-warn/40 bg-os-warn/10 hover:bg-os-warn/20 px-2 py-1 text-xs font-mono text-os-warn transition-colors w-fit group"
          title="Jump to approval queue"
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-os-warn" />
          <span>Gate: {step.gate_checkpoint}</span>
        </Link>
      )}

      {/* Automation Subcard */}
      {step.automation && (
        <div className="mt-auto rounded-lg border border-os-border bg-os-surface2/60 p-2 flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-os-text">
            <Zap className="h-3.5 w-3.5 text-os-accent shrink-0" />
            <span className="truncate">{step.automation.title}</span>
          </div>
          <div className="text-[11px] font-mono">
            {step.automation.state === "live" ? (
              <span className="text-os-ok">
                live · recovering {formatUsdCompact(step.automation.recovered_usd)}/mo
              </span>
            ) : (
              <span className="text-os-dim">
                suggested · +{formatUsdCompact(step.automation.recovered_usd)}/mo
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
