"use client"

import React from "react"
import Link from "next/link"
import {
  UserCheck,
  User,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Coins,
  FileSignature,
  Flame,
  Send,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Lock,
  ArrowRight,
  Terminal,
  Building2,
} from "lucide-react"
import type { CompanyDepartment } from "@/lib/os/departments/registry"

export interface HumanGateRow {
  id: string
  name: string
  firesOn: string
  stopMeaning: string
  defaultApproverRole: string
  iconName?: "Coins" | "FileSignature" | "Flame" | "Send" | "KeyRound"
}

export const HUMAN_GATE_ROWS: HumanGateRow[] = [
  {
    id: "money",
    name: "Money",
    firesOn: "Committing to spend, quoting a price, changing payment terms, discounting.",
    stopMeaning: "Draft the number. Show it. Don't treat it as agreed.",
    defaultApproverRole: "Workspace Operator / Finance",
    iconName: "Coins",
  },
  {
    id: "contracts",
    name: "Contracts",
    firesOn: "Anything creating an obligation — offers, proposals, SOWs, renewals, terminations, compensation.",
    stopMeaning: "Draft it in full. It's a draft until a human says otherwise.",
    defaultApproverRole: "Lead Developer / Operator",
    iconName: "FileSignature",
  },
  {
    id: "irreversible",
    name: "Irreversible operations",
    firesOn: "Deleting or overwriting data, force-pushing, rewriting history, anything with no undo.",
    stopMeaning: "Say exactly what would be destroyed, then wait.",
    defaultApproverRole: "Lead Developer",
    iconName: "Flame",
  },
  {
    id: "publication",
    name: "Publication",
    firesOn: "Anything leaving the company — customer email, posts, investor updates, release announcements.",
    stopMeaning: "Write it. Show it. Never send it.",
    defaultApproverRole: "Workspace Operator",
    iconName: "Send",
  },
  {
    id: "credentials",
    name: "Credentials",
    firesOn: "Creating, rotating, granting, or revoking access.",
    stopMeaning: "Say what you'd change and who gains access. Never do it unasked.",
    defaultApproverRole: "Lead Developer",
    iconName: "KeyRound",
  },
]

export interface Stakeholder {
  role: string
  position?: string
  name?: string
  owns?: string
  assignedGates?: string[]
}

export interface AgentRunner {
  id: string
  name: string
  status?: string // "connected" | "not_configured" | "error"
  detail?: string
  type?: string
  sandboxScoped?: boolean
  tools?: string[]
}

export interface StakeholderGateMatrixProps {
  companyId: string
  stakeholders?: Stakeholder[]
  agents?: AgentRunner[]
  departments?: CompanyDepartment[]
  pendingCount?: number
  pendingReviews?: unknown[] | number
}

function GateIcon({ name, className = "h-4 w-4" }: { name?: string; className?: string }) {
  switch (name) {
    case "Coins":
      return <Coins className={className} />
    case "FileSignature":
      return <FileSignature className={className} />
    case "Flame":
      return <Flame className={className} />
    case "Send":
      return <Send className={className} />
    case "KeyRound":
      return <KeyRound className={className} />
    default:
      return <Lock className={className} />
  }
}

export function StakeholderGateMatrix({
  companyId,
  stakeholders = [],
  agents = [],
  departments = [],
  pendingCount,
  pendingReviews,
}: StakeholderGateMatrixProps) {
  const count =
    typeof pendingCount === "number"
      ? pendingCount
      : Array.isArray(pendingReviews)
      ? pendingReviews.length
      : typeof pendingReviews === "number"
      ? pendingReviews
      : 0

  return (
    <div className="space-y-8">
      {/* Top Protocol Banner */}
      <section className="rounded-xl border border-os-border bg-os-surface p-5 md:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <h2 className="text-sm font-semibold tracking-wide uppercase text-os-text">
                Stakeholders & §6 Human Gate Architecture
              </h2>
            </div>
            <p className="text-xs text-os-muted leading-relaxed">
              Ground truth governance projected from <code className="text-os-accent font-mono text-[11px]">definitions/ontology/company.yaml</code> and <code className="text-os-accent font-mono text-[11px]">AGENTS.md</code>.
              Autonomous runners execute freely within scoped boundaries, but halt at 5 irreversible human gates.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {count > 0 ? (
              <Link
                href={`/c/${companyId}/tasks`}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors"
              >
                <AlertTriangle className="h-4 w-4" />
                <span>{`${count} pending review${count === 1 ? "" : "s"}`}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>All Gates Clear (0 pending)</span>
              </div>
            )}
            <Link
              href={`/c/${companyId}/terminal`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-os-border bg-os-raised px-3 py-2 text-xs font-medium text-os-muted hover:text-os-text hover:bg-os-surface transition-colors"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Verify Invariants</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Section: Company Departments & Operational Units */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-os-accent" />
            <h3 className="text-xs font-bold tracking-wider uppercase text-os-text">
              Company Departments &amp; Operational Units
            </h3>
          </div>
          <span className="text-[11px] font-mono text-os-dim">
            {departments.length} active department{departments.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => {
            const slug = dept.slug || ""
            const isCoreAppRoute = ["funnel", "comms", "content", "social", "finances"].includes(slug)
            const targetHref = isCoreAppRoute
              ? `/c/${companyId}/${slug}`
              : slug === "workflows"
              ? `/c/${companyId}/workflows`
              : slug === "roadmap"
              ? `/c/${companyId}/roadmap`
              : `/c/${companyId}/records`

            return (
              <div
                key={dept.id}
                className="rounded-xl border border-os-border bg-os-surface p-4 flex flex-col justify-between hover:border-os-border-bright transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="h-8 w-8 rounded-lg border border-os-border flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${dept.color || "#3b82f6"}15` }}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: dept.color || "#3b82f6" }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-os-text truncate">{dept.name}</div>
                        <div className="text-[10px] font-mono text-os-dim truncate">{dept.slug}</div>
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-os-raised px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-os-dim border border-os-border">
                      {isCoreAppRoute ? "Cockpit" : "Records"}
                    </span>
                  </div>

                  <p className="text-[11px] text-os-muted line-clamp-2 leading-relaxed pt-0.5">
                    {dept.tagline}
                  </p>

                  {dept.roles && dept.roles.length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-1">
                      {dept.roles.map((r) => (
                        <span
                          key={r.id}
                          className="inline-flex items-center rounded bg-os-raised px-1.5 py-0.5 text-[9px] font-mono text-os-accent border border-os-border"
                        >
                          {r.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-os-border/60 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-[10px] text-os-dim">
                    {dept.recordsCount} record file{dept.recordsCount === 1 ? "" : "s"}
                  </span>
                  <Link
                    href={targetHref}
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-os-accent hover:underline"
                  >
                    <span>Open</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section 1: Human Leadership & Stakeholders */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-os-accent" />
            <h3 className="text-xs font-bold tracking-wider uppercase text-os-text">
              Human Stakeholders & Sign-off Roles
            </h3>
          </div>
          <span className="text-[11px] font-mono text-os-dim">
            {stakeholders.length} defined in company.yaml
          </span>
        </div>

        {stakeholders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-os-border bg-os-surface/50 p-6 text-center">
            <User className="h-8 w-8 mx-auto text-os-dim mb-2 opacity-50" />
            <p className="text-xs font-medium text-os-text">No stakeholders registered yet</p>
            <p className="text-[11px] text-os-muted mt-1 max-w-md mx-auto">
              Run <code className="font-mono text-os-accent">/define-company</code> in the terminal or add roles to{" "}
              <code className="font-mono text-os-accent">definitions/ontology/company.yaml</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stakeholders.map((sh, idx) => {
              const displayName = sh.name || sh.role
              const roleTitle = sh.position || (sh.name ? sh.role : undefined)
              return (
                <div
                  key={`${sh.role}-${idx}`}
                  className="rounded-xl border border-os-border bg-os-surface p-4 flex flex-col justify-between hover:border-os-border-bright transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-os-raised border border-os-border flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-os-text" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-os-text truncate">{displayName}</div>
                          {roleTitle && (
                            <div className="text-[11px] text-os-dim truncate">{roleTitle}</div>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 rounded bg-os-raised px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-os-dim border border-os-border">
                        Human
                      </span>
                    </div>

                    {sh.owns && (
                      <p className="text-[11px] text-os-muted line-clamp-3 leading-relaxed pt-1">
                        {sh.owns}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-os-border/60 flex flex-wrap gap-1.5">
                    {(sh.assignedGates && sh.assignedGates.length > 0
                      ? sh.assignedGates
                      : ["Human Gate Sign-off"]
                    ).map((gate) => (
                      <span
                        key={gate}
                        className="inline-flex items-center gap-1 rounded bg-os-raised px-2 py-0.5 text-[10px] font-mono text-os-muted border border-os-border"
                      >
                        <ShieldCheck className="h-2.5 w-2.5 text-os-accent" />
                        {gate}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 2: Host AI Execution Roster */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-os-accent" />
            <h3 className="text-xs font-bold tracking-wider uppercase text-os-text">
              Host AI Execution Roster & Runner Sandbox
            </h3>
          </div>
          <span className="text-[11px] font-mono text-os-dim">
            Detected local CLI tools & runners
          </span>
        </div>

        {agents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-os-border bg-os-surface/50 p-6 text-center">
            <Cpu className="h-8 w-8 mx-auto text-os-dim mb-2 opacity-50" />
            <p className="text-xs font-medium text-os-text">No CLI agents detected</p>
            <p className="text-[11px] text-os-muted mt-1 max-w-md mx-auto">
              Check that Claude Code, Antigravity, Kiro, or Kimi CLI binaries are in your host system PATH.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {agents.map((ag) => {
              const isConnected = ag.status === "connected" || ag.status === "active"
              return (
                <div
                  key={ag.id}
                  className="rounded-xl border border-os-border bg-os-surface p-4 flex flex-col justify-between hover:border-os-border-bright transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            isConnected ? "bg-emerald-400" : "bg-os-dim"
                          }`}
                        />
                        <span className="text-xs font-bold text-os-text truncate">{ag.name}</span>
                      </div>
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-os-dim">
                        {ag.type || "Runner"}
                      </span>
                    </div>

                    <p className="text-[11px] text-os-muted line-clamp-2 leading-relaxed">
                      {ag.detail ||
                        (isConnected
                          ? "Authenticated and ready for scoped autonomous runs"
                          : "Unconfigured or not detected on local PATH")}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-os-border/60 flex items-center justify-between text-[10px] font-mono text-os-dim">
                    <span>{isConnected ? "Connected" : "Offline"}</span>
                    <span>{ag.sandboxScoped ?? true ? "Scoped" : "Unrestricted"}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Section 3: The Complete §6 Human Gate Matrix Table */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-bold tracking-wider uppercase text-os-text">
              The §6 Human Gate Matrix
            </h3>
          </div>
          <span className="text-[11px] font-mono text-os-dim">
            Stopping rules from AGENTS.md §6
          </span>
        </div>

        <div className="rounded-xl border border-os-border bg-os-surface overflow-hidden shadow-sm">
          <div className="p-4 border-b border-os-border bg-os-raised/40">
            <p className="text-xs text-os-muted italic leading-relaxed">
              &ldquo;An agent goes from &lsquo;here&rsquo;s a draft&rsquo; to &lsquo;it&rsquo;s sent&rsquo; without pausing. Usually that&rsquo;s the point. In five cases it isn&rsquo;t, because the step can&rsquo;t be taken back: money leaves, a promise is made, data is destroyed, something becomes public, or access changes hands. This is a stopping rule, not a permission system.&rdquo;
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-os-border bg-os-raised/60 text-[10px] uppercase tracking-wider text-os-dim">
                <tr>
                  <th scope="col" className="py-3 px-4 font-semibold w-48">Gate Row</th>
                  <th scope="col" className="py-3 px-4 font-semibold">Fires On (Criteria)</th>
                  <th scope="col" className="py-3 px-4 font-semibold">What &ldquo;Stop&rdquo; Means</th>
                  <th scope="col" className="py-3 px-4 font-semibold w-48">Assigned Role</th>
                  <th scope="col" className="py-3 px-4 font-semibold w-32 text-right">Review Queue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-os-border/60">
                {HUMAN_GATE_ROWS.map((gate) => {
                  return (
                    <tr
                      key={gate.id}
                      className="hover:bg-os-raised/30 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-medium text-os-text align-top">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded bg-os-raised border border-os-border flex items-center justify-center shrink-0 text-amber-400">
                            <GateIcon name={gate.iconName} className="h-3.5 w-3.5" />
                          </div>
                          <span className="font-semibold">{gate.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-os-muted leading-relaxed align-top">
                        {gate.firesOn}
                      </td>
                      <td className="py-3.5 px-4 text-os-text leading-relaxed align-top">
                        <span className="font-mono text-[11px] text-amber-300/90">
                          {gate.stopMeaning}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-os-dim align-top">
                        <span className="inline-flex items-center gap-1 rounded bg-os-raised px-2 py-0.5 text-[11px] font-mono text-os-muted border border-os-border">
                          {gate.defaultApproverRole}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right align-top">
                        {count > 0 ? (
                          <Link
                            href={`/c/${companyId}/tasks`}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400 hover:text-amber-300 hover:underline"
                          >
                            <span>{`${count} pending`}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Clear</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
