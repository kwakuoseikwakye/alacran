"use client"

import { AdvancedOnly } from "@/components/advanced-only"
import { useState } from "react"
import Link from "next/link"
import type { ActionProposal } from "@/lib/assistant/action-envelope"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { MAX_ANSWER } from "@/lib/voice/agent/propose-define-company-tool"
import {
  createLeadAction,
  createTransactionAction,
  createContentItemAction,
} from "@/lib/os/records/actions"
import { runPreflightCheckAction } from "@/lib/os/doctor/preflight-actions"
import type { PreflightReport } from "@/lib/os/doctor/preflight"
import { PreflightShield } from "@/components/os/preflight-shield"
import type { LeadStage } from "@/lib/os/schemas/funnel"
import type { TransactionType } from "@/lib/os/schemas/finances"
import type { ContentType, ContentStatus } from "@/lib/os/schemas/content"
import { Database, Terminal, CheckCircle2, ArrowRight } from "lucide-react"

const SETUP_LABELS: Record<string, string> = {
  domain: "What the business does",
  stakeholders: "Customers, team and partners",
  valueFlow: "How value flows",
  bottleneck: "Biggest bottleneck",
}

export function ActionProposalCard({
  proposal,
  onExecuted,
  onActed,
}: {
  proposal: ActionProposal
  onExecuted?: () => void
  /** The owner pressed Approve: fires before anything runs. */
  onActed?: () => void
}) {
  const [status, setStatus] = useState<
    "idle" | "running" | "queued" | "committed" | "dismissed" | "error" | "preflight-blocked"
  >("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [preflightReport, setPreflightReport] = useState<PreflightReport | null>(null)
  const editable = proposal.commandId === "define-company"
  // The define-company run rejects any key but the four answers, and the owner cannot
  // remove one they cannot see, so an editable card starts from exactly those four.
  const [fields, setFields] = useState<Record<string, string>>(() =>
    editable
      ? Object.fromEntries(Object.keys(SETUP_LABELS).map((k) => [k, proposal.fields[k] ?? ""]))
      : proposal.fields
  )
  const blankField = editable && Object.keys(SETUP_LABELS).some((k) => !(fields[k] ?? "").trim())

  if (status === "dismissed") {
    return null
  }

  const isRecordAction =
    proposal.actionType === "create_lead" ||
    proposal.actionType === "create_transaction" ||
    proposal.actionType === "create_content"

  async function handleExecute() {
    onActed?.()
    setErrorMessage("")

    if (isRecordAction) {
      setStatus("running")
      try {
        if (proposal.actionType === "create_lead") {
          const res = await createLeadAction(proposal.companyId, {
            name: proposal.fields.name || proposal.label,
            value: Number(proposal.fields.value) || 0,
            stage: (proposal.fields.stage as LeadStage) || "lead",
            source: proposal.fields.source || "inbound",
          })
          if (res.ok) {
            setStatus("committed")
            onExecuted?.()
          } else {
            setStatus("error")
            setErrorMessage(res.error)
          }
        } else if (proposal.actionType === "create_transaction") {
          const res = await createTransactionAction(proposal.companyId, {
            date: proposal.fields.date || new Date().toISOString().slice(0, 10),
            amount: Number(proposal.fields.amount) || 0,
            description: proposal.fields.description || proposal.label,
            type: (proposal.fields.type as TransactionType) || "expense",
            category: proposal.fields.category || "General",
            account: proposal.fields.account || "Operating",
          })
          if (res.ok) {
            setStatus("committed")
            onExecuted?.()
          } else {
            setStatus("error")
            setErrorMessage(res.error)
          }
        } else if (proposal.actionType === "create_content") {
          const res = await createContentItemAction(proposal.companyId, {
            title: proposal.fields.title || proposal.label,
            type: (proposal.fields.type as ContentType) || "post",
            channel: proposal.fields.channel || "website",
            status: (proposal.fields.status as ContentStatus) || "idea",
          })
          if (res.ok) {
            setStatus("committed")
            onExecuted?.()
          } else {
            setStatus("error")
            setErrorMessage(res.error)
          }
        }
      } catch (err) {
        setStatus("error")
        setErrorMessage(err instanceof Error ? err.message : String(err))
      }
      return
    }

    // Command Action: Run Pre-Flight Health Shield first
    setStatus("running")
    try {
      const preflight = await runPreflightCheckAction(proposal.companyId, proposal.commandId)
      if (!preflight.canProceed) {
        setPreflightReport(preflight)
        setStatus("preflight-blocked")
        return
      }

      const res = await runCompanyCommand(proposal.commandId, fields, proposal.companyId)
      if (res.started) {
        setStatus("queued")
        onExecuted?.()
      } else {
        setStatus("error")
        setErrorMessage(res.message || "Failed to start command.")
      }
    } catch (err) {
      setStatus("error")
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }

  const deptLink =
    proposal.actionType === "create_lead"
      ? `/c/${proposal.companyId}/funnel`
      : proposal.actionType === "create_transaction"
        ? `/c/${proposal.companyId}/finances`
        : proposal.actionType === "create_content"
          ? `/c/${proposal.companyId}/content`
          : `/c/${proposal.companyId}/tasks`

  return (
    <div
      className={`mt-2.5 rounded-lg border p-3 text-xs text-foreground shadow-md backdrop-blur-sm ${
        isRecordAction
          ? "border-emerald-500/35 bg-emerald-500/10 dark:bg-emerald-950/25"
          : "border-amber-500/35 bg-amber-500/10 dark:bg-amber-950/25"
      }`}
      role="region"
      aria-label="Proposed action"
    >
      <div
        className={`flex items-center justify-between gap-2 border-b pb-2 ${
          isRecordAction ? "border-emerald-500/25" : "border-amber-500/25"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${
              isRecordAction
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
            }`}
          >
            {isRecordAction ? <Database className="w-3 h-3" /> : <Terminal className="w-3 h-3" />}
            {isRecordAction ? "Save a record" : "Prepare a draft"}
          </span>
          <AdvancedOnly><span className="font-mono text-xs text-foreground">/{proposal.commandId}</span></AdvancedOnly>
        </div>

      </div>

      <div className="mt-2 space-y-1.5 text-sm leading-relaxed">
        <div className="font-semibold text-foreground">{proposal.label}</div>
        {proposal.rationale && (
          <p className="text-sm text-muted-foreground italic">{proposal.rationale}</p>
        )}

        <div className={`mt-2 ${editable ? "" : "max-h-36 overflow-y-auto "}rounded bg-background/80 dark:bg-black/40 p-2 text-sm text-foreground/90 dark:text-white/80 space-y-1 border border-border`}>
          {editable
            ? Object.entries(SETUP_LABELS).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="font-medium text-amber-600 dark:text-amber-400/90">{label}</span>
                  <textarea
                    value={fields[key] ?? ""}
                    onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                    disabled={status !== "idle"}
                    rows={2}
                    maxLength={MAX_ANSWER}
                    className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                  />
                </label>
              ))
            : Object.entries(proposal.fields).map(([key, val]) => (
                <div key={key} className="break-words">
                  <span
                    className={`font-medium ${
                      isRecordAction ? "text-emerald-400" : "text-amber-600 dark:text-amber-400/90"
                    }`}
                  >
                    {key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())}:
                  </span>{" "}
                  <span>{val}</span>
                </div>
              ))}
        </div>
        {!isRecordAction ? (
          <p className="text-xs text-muted-foreground">
            {editable ? "Nothing is saved until you approve the draft in Pending Reviews. " : ""}
            Preparing the draft uses your connected AI.
          </p>
        ) : null}
      </div>

      {status === "preflight-blocked" && preflightReport && (
        <div className="mt-3">
          <PreflightShield report={preflightReport} onDismiss={() => setStatus("idle")} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 pt-1">
        {status === "idle" && (
          <>
            <button
              type="button"
              onClick={() => void handleExecute()}
              disabled={blankField}
              title={blankField ? "Fill in every box first" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                isRecordAction
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-amber-500 hover:bg-amber-400 text-black"
              }`}
            >
              {isRecordAction ? <Database className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />}
              {isRecordAction ? "Save record" : "Prepare draft"}
            </button>
            <button
              type="button"
              onClick={() => setStatus("dismissed")}
              className="rounded-md border border-border hover:border-muted-foreground/40 bg-card px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </>
        )}

        {status === "running" && (
          <div
            className={`flex items-center gap-2 text-sm ${
              isRecordAction ? "text-emerald-400" : "text-amber-600 dark:text-amber-300"
            }`}
          >
            <span
              className={`inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-t-transparent ${
                isRecordAction
                  ? "border-emerald-400"
                  : "border-amber-600 dark:border-amber-300"
              }`}
            />
            {isRecordAction ? "Saving your record…" : "Preparing your task…"}
          </div>
        )}

        {status === "committed" && (
          <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Saved to your records.</span>
            <Link
              href={deptLink}
              className="inline-flex items-center gap-1 text-emerald-400 underline hover:text-emerald-300 ml-1 text-xs"
            >
              View saved records <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {status === "queued" && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Queued! Review uncommitted diff in Pending Reviews.</span>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col gap-1 text-sm text-rose-400">
            <span>Error: {errorMessage}</span>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="self-start text-xs underline hover:text-rose-300"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
