import Link from "next/link"
import type React from "react"
import { ArrowUpRight, Shield, Terminal, Users } from "lucide-react"

export type MappedDepartmentRole = {
  id: string
  name: string
  owns?: string
  decisions: string[]
}

export type DepartmentKey = "funnel" | "finances" | "social" | "content" | "operations"

export function mapRolesToDepartments(
  roles: Array<{ id: string; name: string; owns?: string }>,
  decisions: Array<{ decision: string; approver: string }>
): Record<DepartmentKey, MappedDepartmentRole[]> {
  const result: Record<DepartmentKey, MappedDepartmentRole[]> = {
    funnel: [],
    finances: [],
    social: [],
    content: [],
    operations: [],
  }

  for (const role of roles) {
    const roleDecisions = decisions
      .filter((d) => d.approver === role.id)
      .map((d) => d.decision)

    const mappedRole: MappedDepartmentRole = {
      id: role.id,
      name: role.name,
      ...(role.owns ? { owns: role.owns } : {}),
      decisions: roleDecisions,
    }

    const text = [role.id, role.name, role.owns ?? ""].join(" ").toLowerCase()

    if (
      role.id === "lead-developer" ||
      text.includes("developer") ||
      text.includes("architecture") ||
      text.includes("releases") ||
      text.includes("ci/cd")
    ) {
      result.operations.push(mappedRole)
    } else if (
      text.includes("funnel") ||
      text.includes("sales") ||
      text.includes("crm") ||
      text.includes("deals")
    ) {
      result.funnel.push(mappedRole)
    } else if (
      text.includes("finance") ||
      text.includes("accounting") ||
      text.includes("ledger") ||
      text.includes("tax")
    ) {
      result.finances.push(mappedRole)
    } else if (
      text.includes("social") ||
      text.includes("audience") ||
      text.includes("community")
    ) {
      result.social.push(mappedRole)
    } else if (
      text.includes("content") ||
      text.includes("writer") ||
      text.includes("editorial") ||
      text.includes("publishing")
    ) {
      result.content.push(mappedRole)
    } else {
      // Default/operator role (e.g. workspace-operator) falls back to operations
      result.operations.push(mappedRole)
    }
  }

  return result
}

function formatDecisionBadge(dec: string): string {
  const trimmed = dec.trim()
  if (/^(approves?|approving|publishing|modifying|committing|signing)/i.test(trimmed)) {
    return trimmed
  }
  return `Approves ${trimmed}`
}

export function DepartmentColumn({
  deptKey,
  title,
  roles,
  agents,
  terminalSessionsCount = 0,
  connectors = [],
  companyId,
}: {
  deptKey: DepartmentKey
  title: string
  roles: MappedDepartmentRole[]
  agents: Array<{ id: string; name: string; status?: string }>
  terminalSessionsCount?: number
  connectors?: Array<{ id: string; status: "connected" | "not_configured" | "error" }>
  companyId?: string
}) {
  const deptHref =
    deptKey === "operations"
      ? companyId
        ? `/c/${companyId}/agents`
        : "/agents"
      : companyId
      ? `/c/${companyId}/${deptKey}`
      : `/${deptKey}`

  return (
    <div className="flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-4 shadow-sm hover:border-os-border-strong transition-all h-full">
      <div className="space-y-4">
        {/* Column Header */}
        <div className="border-b border-os-border/60 pb-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={deptHref}
              className="group/title inline-flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wider text-os-text hover:text-os-accent transition-colors"
            >
              <span>{title}</span>
              <ArrowUpRight className="size-3 text-os-dim opacity-0 transition-opacity group-hover/title:opacity-100" />
            </Link>

            <div className="flex items-center gap-2">
              {/* Connector dots */}
              {connectors.length > 0 && (
                <div className="flex items-center gap-1 bg-os-surface2 border border-os-border/50 px-1.5 py-0.5 rounded-full">
                  {connectors.map((c) => {
                    const dotColor =
                      c.status === "connected"
                        ? "var(--ok, #3df08c)"
                        : c.status === "error"
                        ? "var(--err, #ff6259)"
                        : "var(--dim, #54665b)"
                    return (
                      <span
                        key={c.id}
                        title={`${c.id}: ${c.status}`}
                        className="inline-block size-1.5 rounded-full"
                        style={{ backgroundColor: dotColor }}
                      />
                    )
                  })}
                </div>
              )}

              {/* Agent count badge */}
              <span className="rounded bg-os-surface3 border border-os-border px-1.5 py-0.5 font-mono text-[10px] text-os-dim">
                {agents.length} agent{agents.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>

        {/* Lead Role Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-os-dim">
            <Shield className="size-3 text-os-accent" />
            <span>Lead Role & Governance</span>
          </div>

          {roles.length === 0 ? (
            <div className="rounded border border-dashed border-os-border/60 bg-os-surface2/40 p-2.5 text-center">
              <p className="text-[11px] font-mono text-os-dim">No lead role assigned</p>
            </div>
          ) : (
            <div className="space-y-2">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="rounded border border-os-border/80 bg-os-surface2 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-display text-xs font-semibold text-os-text truncate">
                      {role.name}
                    </h4>
                    <span className="font-mono text-[9px] text-os-dim uppercase">
                      {role.id}
                    </span>
                  </div>

                  {role.owns && (
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-os-text-2">
                      {role.owns}
                    </p>
                  )}

                  {role.decisions.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1">
                      {role.decisions.map((dec, i) => (
                        <span
                          key={i}
                          title={dec}
                          className="inline-flex items-center gap-1 rounded bg-os-surface3 border border-os-border px-1.5 py-0.5 font-mono text-[9px] text-os-text max-w-full"
                        >
                          <Shield className="size-2.5 text-os-accent flex-shrink-0" />
                          <span className="truncate">{formatDecisionBadge(dec)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Autonomous Agent Roster */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-os-dim">
              <Users className="size-3 text-os-accent" />
              <span>Autonomous Agents</span>
            </div>

            {terminalSessionsCount > 0 && (
              <div
                className="flex items-center gap-1 text-[10px] font-mono text-[var(--ok,#3df08c)]"
                title={`${terminalSessionsCount} active terminal session(s)`}
              >
                <span className="relative flex size-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--ok,#3df08c)] opacity-75" />
                  <span className="relative inline-flex rounded-full size-1.5 bg-[var(--ok,#3df08c)]" />
                </span>
                <Terminal className="size-2.5" />
                <span>{terminalSessionsCount}</span>
              </div>
            )}
          </div>

          {agents.length === 0 ? (
            <div className="rounded border border-dashed border-os-border/60 bg-os-surface2/40 p-2.5 text-center">
              <p className="text-[11px] font-mono text-os-dim">No agents in roster</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {agents.map((agent) => {
                const status = (agent.status || "active").toLowerCase()
                const isRunningOrActive = status === "active" || status === "running"
                const isIdle = status === "idle"
                const isTraining = status === "training"

                const dotClass = isRunningOrActive
                  ? "bg-[var(--ok,#3df08c)]"
                  : isIdle
                  ? "bg-amber-400"
                  : isTraining
                  ? "bg-blue-400"
                  : "bg-os-dim"

                return (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between rounded border border-os-border/70 bg-os-surface2 px-2.5 py-1.5 text-xs font-mono"
                  >
                    <span className="truncate text-os-text text-[11px]">{agent.name}</span>
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      <span className={`size-1.5 rounded-full ${dotClass}`} />
                      <span className="text-[9px] uppercase tracking-wider text-os-dim">
                        {status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Column Footer */}
      <div className="mt-4 pt-3 border-t border-os-border/50">
        <Link
          href={deptHref}
          className="inline-flex items-center gap-1 text-[11px] font-mono text-os-accent hover:underline"
        >
          <span>Open {title} Surface</span>
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </div>
  )
}
