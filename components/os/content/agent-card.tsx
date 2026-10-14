import React from "react"
import { Wrench } from "lucide-react"
import { Dot } from "@/components/os/terminal"
import { prettyTool, type ContentAgentModel } from "@/lib/os/departments/adapters/content-adapter"

export function AgentCard({
  agent,
  lead = false,
}: {
  agent: ContentAgentModel
  lead?: boolean
}) {
  return (
    <div
      className={`rounded-lg border bg-os-surface p-4 ${
        lead ? "border-os-accent/40 shadow-sm" : "border-os-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Dot
              state={agent.status === "active" ? "ok" : "warn"}
              pulse={agent.status === "active"}
            />
            <span className="truncate text-[14px] font-bold text-os-text">{agent.name}</span>
            {lead && (
              <span className="rounded-xs border border-os-accent/30 bg-os-accent/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-os-accent">
                lead
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-os-dim">
            {agent.role} · {agent.model}
          </div>
        </div>
        <span
          className={`shrink-0 font-mono text-[10px] uppercase tracking-wide ${
            agent.status === "active" ? "text-os-ok" : "text-os-warn"
          }`}
        >
          {agent.status}
        </span>
      </div>
      <p className="mt-2.5 text-[12px] leading-relaxed text-os-muted">{agent.description}</p>
      {agent.tools.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.tools.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-xs border border-os-border bg-os-surface2 px-1.5 py-0.5 font-mono text-[10px] text-os-muted"
            >
              <Wrench className="h-2.5 w-2.5" /> {prettyTool(t)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
