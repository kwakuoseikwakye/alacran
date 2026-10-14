import React from "react"
import type { Agent } from "@/lib/os/brain/types"
import type { AgentNode } from "@/lib/os/org/hierarchy"
import { venturesForAgent } from "@/lib/os/org/ventures"

const STATUS_DOT: Record<string, string> = {
  active: "bg-os-text",
  idle: "bg-os-muted",
  training: "bg-os-muted animate-pulse",
  planned: "border border-os-dim bg-transparent",
}

export function VentureDots({ agentId }: { agentId: string }) {
  const serving = venturesForAgent(agentId)
  if (serving.length === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {serving.map((v) => (
        <span
          key={v.id}
          title={v.label}
          className="h-1 w-1 rounded-full"
          style={{ background: v.color }}
        />
      ))}
    </span>
  )
}

export function AgentPill({ agent, dim = false }: { agent: Agent; dim?: boolean }) {
  const statusClass = STATUS_DOT[agent.status] ?? STATUS_DOT.active
  return (
    <div
      title={`${agent.role} — ${agent.description}`}
      className={`hoverable flex items-center gap-1.5 rounded-full border border-os-border bg-os-bg px-2.5 py-1.5 transition-opacity ${
        dim ? "opacity-20" : ""
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusClass}`} />
      <span className="truncate text-[10px] font-medium text-os-text">{agent.name}</span>
      <VentureDots agentId={agent.id} />
    </div>
  )
}

export function AgentNodePill({
  node,
  depth = 0,
  dimFor,
}: {
  node: AgentNode
  depth?: number
  dimFor?: (id: string) => boolean
}) {
  return (
    <div className="space-y-1.5" style={{ paddingLeft: depth ? `${depth * 10}px` : undefined }}>
      <AgentPill agent={node.agent} dim={dimFor?.(node.agent.id) ?? false} />
      {node.children.map((child) => (
        <AgentNodePill key={child.agent.id} node={child} depth={depth + 1} dimFor={dimFor} />
      ))}
    </div>
  )
}
