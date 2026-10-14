"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import {
  Terminal,
  Play,
  ShieldCheck,
  Clock,
  Cpu,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  Workflow,
  Sparkles,
  ArrowRight,
} from "lucide-react"
import { Badge } from "@/components/os/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import type { CompanyTerminalStatus } from "@/lib/terminal/sessions"

export interface FlowCommandField {
  key: string
  label: string
  placeholder?: string
  required?: boolean
  multiline?: boolean
}

export interface FlowCommand {
  id: string
  commandId: string
  name: string
  description: string
  gateRequired: boolean
  gateType?: string
  targetPath?: string
  fields?: FlowCommandField[]
}

export interface CommandTrack {
  id: "daily" | "governance" | "engineering" | string
  title: string
  subtitle: string
  description: string
  iconName: "clock" | "shield" | "cpu"
  commands: FlowCommand[]
}

export const COMMAND_TRACKS: CommandTrack[] = [
  {
    id: "daily",
    title: "Daily Cadence",
    subtitle: "Synchronous Inbound & Daily State",
    description:
      "Scheduled and on-demand cadence workflows that ingest chats, unread emails, external knowledge changes, and weekly executive summaries.",
    iconName: "clock",
    commands: [
      {
        id: "/check-messages",
        commandId: "check-messages",
        name: "Check Messages",
        description:
          "Ingests chats across bridged networks into notes/company/messages/ summarizing decisions and open questions.",
        gateRequired: false,
        gateType: "Ungated (Read-only)",
        targetPath: "notes/company/messages/",
      },
      {
        id: "/check-inbox",
        commandId: "check-inbox",
        name: "Check Inbox",
        description:
          "Triages unread mail via connected Google accounts (gog CLI) into read-only snapshot summaries.",
        gateRequired: false,
        gateType: "Ungated (Read-only)",
        targetPath: "notes/company/email-checks/",
      },
      {
        id: "/check-notion",
        commandId: "check-notion",
        name: "Check Notion",
        description:
          "Summarizes recently modified Notion pages and databases into notes/company/notion-checks/.",
        gateRequired: false,
        gateType: "Ungated (Read-only)",
        targetPath: "notes/company/notion-checks/",
      },
      {
        id: "/digest",
        commandId: "digest",
        name: "Weekly Digest",
        description:
          "Scans recent notes, decisions, retros, and inbox backlog across the company to generate a structured weekly digest.",
        gateRequired: false,
        gateType: "Ungated (Aggregate)",
        targetPath: "notes/company/digests/",
        fields: [
          {
            key: "period",
            label: "Period (optional)",
            placeholder: "e.g. last 7 days",
            required: false,
          },
        ],
      },
    ],
  },
  {
    id: "governance",
    title: "Governance & Integrity",
    subtitle: "Verification, RFCs & Session Continuity",
    description:
      "Hard invariant verification checks, architectural decisions (RFCs), retrospectives, and session handoffs.",
    iconName: "shield",
    commands: [
      {
        id: "/verify",
        commandId: "verify",
        name: "System Verification",
        description:
          "Runs repository invariant checks (scripts/verify.py) across secrets leakage, ontology completeness, and decisions.",
        gateRequired: false,
        gateType: "Ungated (Invariant Check)",
        targetPath: "scripts/verify.py",
      },
      {
        id: "/decision",
        commandId: "decision",
        name: "Record Decision (RFC)",
        description:
          "Creates an architectural decision record (RFC). Gated under §6 Contracts & Governance before human acceptance.",
        gateRequired: true,
        gateType: "§6 Contracts",
        targetPath: "docs/decisions/",
        fields: [
          {
            key: "context",
            label: "Context",
            required: true,
            multiline: true,
            placeholder: "What situation or constraint made this decision necessary?",
          },
          {
            key: "decision",
            label: "Decision",
            required: true,
            multiline: true,
            placeholder: "What was decided? State it as one clear sentence.",
          },
          {
            key: "rationale",
            label: "Rationale",
            required: true,
            multiline: true,
            placeholder: "Why is this the best choice?",
          },
          {
            key: "alternatives",
            label: "Alternatives Considered",
            required: true,
            multiline: true,
            placeholder: "What else was considered, and why wasn't it chosen?",
          },
          {
            key: "consequences",
            label: "Consequences",
            required: true,
            multiline: true,
            placeholder: "What changes as a result, good and bad?",
          },
        ],
      },
      {
        id: "/retro",
        commandId: "retro",
        name: "Retrospective (KPT)",
        description:
          "Facilitates Keep-Problem-Try retrospective reviews grounded in the company's working cycle.",
        gateRequired: false,
        gateType: "Ungated (Internal)",
        targetPath: "docs/retros/",
        fields: [
          {
            key: "keep",
            label: "Keep",
            required: true,
            multiline: true,
            placeholder: "What worked, what should continue",
          },
          {
            key: "problem",
            label: "Problem",
            required: true,
            multiline: true,
            placeholder: "What got stuck or was inefficient",
          },
          {
            key: "try",
            label: "Try",
            required: true,
            multiline: true,
            placeholder: "1-3 improvements for next cycle",
          },
        ],
      },
      {
        id: "/handoff",
        commandId: "handoff",
        name: "Session Handoff",
        description:
          "Appends current repository status, decisions made, and open blockers to HANDOFF.md for session continuity.",
        gateRequired: false,
        gateType: "Ungated (Session Log)",
        targetPath: "HANDOFF.md",
      },
    ],
  },
  {
    id: "engineering",
    title: "Engineering & Operations",
    subtitle: "Ontology, Financials & Operations",
    description:
      "Core company definitions, financial reconciliations, codebase orientations, and issue triaging.",
    iconName: "cpu",
    commands: [
      {
        id: "/accounting",
        commandId: "accounting",
        name: "Financial Accounting",
        description:
          "Reconciles financial transactions, receipts, and bank ledgers. Gated under §6 Money: stops before commits or transfers.",
        gateRequired: true,
        gateType: "§6 Money",
        targetPath: "records/finances/",
      },
      {
        id: "/orientation",
        commandId: "orientation",
        name: "Company Orientation",
        description:
          "Generates plain-language onboarding note describing real repository capabilities, ontology, and skills.",
        gateRequired: false,
        gateType: "Ungated (Read-only)",
        targetPath: "notes/company/orientation/",
      },
      {
        id: "/triage-issue",
        commandId: "triage-issue",
        name: "Triage Issue",
        description:
          "Analyzes incoming GitHub issues and proposes technical plan in notes/company/triage/ without modifying issues.",
        gateRequired: false,
        gateType: "Ungated (Read-only)",
        targetPath: "notes/company/triage/",
      },
      {
        id: "/define-company",
        commandId: "define-company",
        name: "Define Ontology",
        description:
          "Updates core company ontology in definitions/ontology/company.yaml. Gated under §6 Irreversible Operations.",
        gateRequired: true,
        gateType: "§6 Irreversible ops",
        targetPath: "definitions/ontology/company.yaml",
        fields: [
          {
            key: "domain",
            label: "Business Domain",
            required: true,
            multiline: true,
            placeholder: "What problem does the company solve?",
          },
          {
            key: "stakeholders",
            label: "Key Stakeholders",
            required: true,
            multiline: true,
            placeholder: "Who are customers, employees, partners and their roles?",
          },
          {
            key: "valueFlow",
            label: "Core Value Flow",
            required: true,
            multiline: true,
            placeholder: "Input, transformation, output",
          },
          {
            key: "bottleneck",
            label: "Current Bottleneck",
            required: true,
            multiline: true,
            placeholder: "Current biggest bottleneck or operational friction",
          },
        ],
      },
    ],
  },
]

export function getCommandTrack(id: string): CommandTrack | undefined {
  return COMMAND_TRACKS.find((t) => t.id === id)
}

export function getFlowCommand(id: string): FlowCommand | undefined {
  for (const track of COMMAND_TRACKS) {
    const cmd = track.commands.find((c) => c.id === id || c.commandId === id)
    if (cmd) return cmd
  }
  return undefined
}

export interface CommandFlowEngineProps {
  backgroundCommandIds?: string[]
  companyId: string
  companyRoot?: string
  terminalStatus?: CompanyTerminalStatus
}


export function CommandFlowEngine({
  backgroundCommandIds = [],
  companyId,
  companyRoot,
  terminalStatus: initialTerminalStatus,
}: CommandFlowEngineProps): React.ReactElement {
  const [selectedTrack, setSelectedTrack] = useState<string>("all")
  const [runningCmd, setRunningCmd] = useState<string | null>(null)
  const [expandedCmd, setExpandedCmd] = useState<string | null>(null)
  const [fieldInputs, setFieldInputs] = useState<Record<string, Record<string, string>>>({})
  const [notification, setNotification] = useState<{
    id: string
    tone: "ok" | "err" | "warn"
    message: string
  } | null>(null)
  const [terminalStatus, setTerminalStatus] = useState<CompanyTerminalStatus>(
    initialTerminalStatus ?? { running: false, hasAiAgent: false, count: 0, labels: [] }
  )

  useEffect(() => {
    let cancelled = false
    async function checkTerminal() {
      try {
        const res = await fetch("/api/terminal-status")
        if (!res.ok) return
        const data = (await res.json()) as { statusByAgent?: Record<string, CompanyTerminalStatus> }
        if (!cancelled && data.statusByAgent && data.statusByAgent[companyId]) {
          setTerminalStatus(data.statusByAgent[companyId])
        }
      } catch {
        // Ignored in client
      }
    }
    const timer = setInterval(checkTerminal, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [companyId])

  const setCommandField = (cmdId: string, fieldKey: string, value: string) => {
    setFieldInputs((prev) => ({
      ...prev,
      [cmdId]: {
        ...(prev[cmdId] || {}),
        [fieldKey]: value,
      },
    }))
  }

  const handleDispatch = async (cmd: FlowCommand) => {
    const cmdValues = fieldInputs[cmd.id] || {}

    if (!backgroundCommandIds.includes(cmd.commandId)) return

    // Check required fields
    if (cmd.fields) {
      const missing = cmd.fields.filter((f) => f.required && !cmdValues[f.key]?.trim())
      if (missing.length > 0) {
        setExpandedCmd(cmd.id)
        setNotification({
          id: cmd.id,
          tone: "warn",
          message: `Required fields missing for ${cmd.id}: ${missing.map((f) => f.label).join(", ")}. Fill them below or execute in Terminal.`,
        })
        return
      }
    }

    setRunningCmd(cmd.id)
    setNotification(null)

    try {
      const result = await runCompanyCommand(cmd.commandId, cmdValues, companyId)
      if (result.started) {
        setNotification({
          id: cmd.id,
          tone: "ok",
          message: result.message || `Dispatched ${cmd.id} in background with run locks.`,
        })
      } else {
        setNotification({
          id: cmd.id,
          tone: "warn",
          message: `${cmd.id}: ${result.message}`,
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to dispatch command."
      setNotification({
        id: cmd.id,
        tone: "err",
        message: `${cmd.id}: ${msg}`,
      })
    } finally {
      setRunningCmd(null)
    }
  }

  const filteredTracks =
    selectedTrack === "all"
      ? COMMAND_TRACKS
      : COMMAND_TRACKS.filter((t) => t.id === selectedTrack)

  const renderTrackIcon = (iconName: CommandTrack["iconName"]) => {
    switch (iconName) {
      case "clock":
        return <Clock className="size-4 text-sky-400" />
      case "shield":
        return <ShieldCheck className="size-4 text-emerald-400" />
      case "cpu":
        return <Cpu className="size-4 text-purple-400" />
      default:
        return <Workflow className="size-4 text-os-accent" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview & Live Status Header */}
      <div className="rounded-xl border border-os-border bg-os-surface p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-os-accent" />
              <h2 className="text-sm font-semibold tracking-wider text-os-text uppercase font-mono">
                Command &amp; Skill Flow Engine
              </h2>
            </div>
            <p className="text-xs text-os-dim max-w-2xl">
              Local-first operational workflows grounded in plain files (
              <span className="font-mono text-os-text">definitions/</span>,{" "}
              <span className="font-mono text-os-text">docs/</span>,{" "}
              <span className="font-mono text-os-text">notes/</span>). Run workflows
              interactively in the scoped terminal or dispatch headless background runs with run
              locks and <span className="text-amber-400 font-medium">§6 Human Gate</span>{" "}
              enforcement.
              {companyRoot && (
                <span className="block font-mono text-[11px] text-os-dim/70 mt-1">
                  Workspace root: {companyRoot}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {terminalStatus.running ? (
              <Link
                href={`/c/${companyId}/terminal`}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-mono font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <Terminal className="size-3.5" />
                <span>
                  {terminalStatus.hasAiAgent ? "Agent Running" : "Terminal Active"} (
                  {terminalStatus.count})
                </span>
                <ArrowRight className="size-3" />
              </Link>
            ) : (
              <Link
                href={`/c/${companyId}/terminal`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-os-border bg-os-surface2 px-3 py-1.5 text-xs font-mono text-os-dim hover:text-os-text hover:border-os-border/80 transition-colors"
              >
                <Terminal className="size-3.5 text-os-dim" />
                <span>Open Terminal</span>
              </Link>
            )}
          </div>
        </div>

        {/* Track Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-os-border/50">
          <span className="text-[11px] font-mono uppercase tracking-wider text-os-dim mr-1">
            Tracks:
          </span>
          <button
            type="button"
            onClick={() => setSelectedTrack("all")}
            className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${
              selectedTrack === "all"
                ? "bg-os-accent text-os-ink font-semibold shadow-xs"
                : "bg-os-surface2 text-os-dim hover:text-os-text border border-os-border/60"
            }`}
          >
            All Tracks (12)
          </button>
          {COMMAND_TRACKS.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => setSelectedTrack(track.id)}
              className={`px-2.5 py-1 text-xs rounded font-mono flex items-center gap-1.5 transition-colors ${
                selectedTrack === track.id
                  ? "bg-os-accent text-os-ink font-semibold shadow-xs"
                  : "bg-os-surface2 text-os-dim hover:text-os-text border border-os-border/60"
              }`}
            >
              {renderTrackIcon(track.iconName)}
              <span>{track.title}</span>
              <span className="text-[10px] opacity-75">({track.commands.length})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Status Notification */}
      {notification && (
        <div
          role="status"
          className={`flex items-start justify-between gap-3 rounded-lg border p-3.5 text-xs animate-in fade-in duration-200 ${
            notification.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
              : notification.tone === "warn"
              ? "border-amber-500/30 bg-amber-950/20 text-amber-300"
              : "border-red-500/30 bg-red-950/20 text-red-300"
          }`}
        >
          <div className="flex items-start gap-2 min-w-0">
            {notification.tone === "ok" ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : notification.tone === "warn" ? (
              <AlertCircle className="size-4 shrink-0 text-amber-400 mt-0.5" />
            ) : (
              <AlertCircle className="size-4 shrink-0 text-red-400 mt-0.5" />
            )}
            <div className="space-y-0.5 min-w-0">
              <span className="font-medium">{notification.message}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-os-dim hover:text-os-text shrink-0 text-xs px-1 font-mono"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Operational Tracks */}
      <div className="space-y-8">
        {filteredTracks.map((track, trackIndex) => (
          <section key={track.id} className="space-y-3">
            {/* Track Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-os-border/60 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-os-surface2 border border-os-border/60">
                  {renderTrackIcon(track.iconName)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-os-dim font-medium">
                      0{trackIndex + 1}
                    </span>
                    <h3 className="text-base font-semibold text-os-text tracking-tight">
                      {track.title}
                    </h3>
                    <Badge tone="neutral" className="text-[10px]">
                      {track.commands.length} workflows
                    </Badge>
                  </div>
                  <p className="text-xs text-os-dim mt-0.5">{track.description}</p>
                </div>
              </div>
            </div>

            {/* Command Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {track.commands.map((cmd) => {
                const isRunning = runningCmd === cmd.id
                const isExpanded = expandedCmd === cmd.id
                const hasFields = cmd.fields && cmd.fields.length > 0

                return (
                  <div
                    key={cmd.id}
                    className="flex flex-col justify-between rounded-xl border border-os-border bg-os-surface p-4 hover:border-os-border/80 transition-all gap-3.5"
                  >
                    {/* Top: Slug, Gate badge & Name */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <code className="rounded bg-os-surface2 px-2 py-0.5 font-mono text-xs font-semibold text-os-accent border border-os-border/70">
                            {cmd.id}
                          </code>
                          <span className="text-xs font-medium text-os-text">{cmd.name}</span>
                        </div>

                        {/* §6 Human Gate Badge */}
                        {cmd.gateRequired ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-amber-400 shrink-0"
                            title="Requires human confirmation under §6 The Gate"
                          >
                            <Lock className="size-3" />
                            <span>{cmd.gateType ?? "§6 Human Gate"}</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400 shrink-0"
                            title="Ungated: Safe read or local internal operation"
                          >
                            <Unlock className="size-3" />
                            <span>{cmd.gateType ?? "Ungated"}</span>
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-os-dim leading-relaxed">{cmd.description}</p>

                      {/* Artifact Target */}
                      {cmd.targetPath && (
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-os-dim/80 pt-1">
                          <FileText className="size-3 text-os-dim shrink-0" />
                          <span className="truncate">{cmd.targetPath}</span>
                        </div>
                      )}
                    </div>

                    {/* Expandable Parameters for commands with inputs */}
                    {hasFields && (
                      <div className="border-t border-os-border/40 pt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => setExpandedCmd(isExpanded ? null : cmd.id)}
                          className="flex items-center justify-between w-full text-[11px] font-mono text-os-dim hover:text-os-text transition-colors"
                        >
                          <span className="flex items-center gap-1">
                            <span>Parameters</span>
                            <span className="opacity-75">
                              ({cmd.fields!.filter((f) => f.required).length} required)
                            </span>
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="space-y-2.5 pt-1">
                            {cmd.fields!.map((field) => (
                              <div key={field.key} className="space-y-1">
                                <label className="text-[11px] font-medium text-os-text flex items-center justify-between">
                                  <span>{field.label}</span>
                                  {field.required && (
                                    <span className="text-[10px] font-mono text-amber-400">
                                      required
                                    </span>
                                  )}
                                </label>
                                {field.multiline ? (
                                  <Textarea
                                    rows={2}
                                    placeholder={field.placeholder}
                                    value={fieldInputs[cmd.id]?.[field.key] ?? ""}
                                    onChange={(e) =>
                                      setCommandField(cmd.id, field.key, e.target.value)
                                    }
                                    className="text-xs font-mono bg-os-surface2/60 border-os-border"
                                    disabled={isRunning}
                                  />
                                ) : (
                                  <Input
                                    placeholder={field.placeholder}
                                    value={fieldInputs[cmd.id]?.[field.key] ?? ""}
                                    onChange={(e) =>
                                      setCommandField(cmd.id, field.key, e.target.value)
                                    }
                                    className="h-8 text-xs font-mono bg-os-surface2/60 border-os-border"
                                    disabled={isRunning}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-os-border/40">
                      <Link
                        href={`/c/${companyId}/terminal?cmd=${encodeURIComponent(cmd.id)}`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-os-border bg-os-surface2 px-2.5 py-1.5 text-xs font-medium text-os-text hover:bg-os-surface2/80 hover:border-os-border/80 transition-colors"
                        title={`Run ${cmd.id} in interactive terminal`}
                      >
                        <Terminal className="size-3.5 text-os-dim" />
                        <span>Run in Terminal</span>
                      </Link>

                      <Button
                        size="sm"
                        variant="default"
                        disabled={isRunning || !backgroundCommandIds.includes(cmd.commandId)}
                        onClick={() => handleDispatch(cmd)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium"
                        title={backgroundCommandIds.includes(cmd.commandId) ? "Prepare a draft for your review" : "This workflow cannot run in the background"}
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            <span>Dispatching…</span>
                          </>
                        ) : (
                          <>
                            <Play className="size-3.5" />
                            <span>{backgroundCommandIds.includes(cmd.commandId) ? "Prepare draft" : "Requires a live session"}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
