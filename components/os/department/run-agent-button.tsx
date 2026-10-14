"use client"

import { useState } from "react"
import Link from "next/link"
import { Play, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"

export function RunAgentButton({
  departmentName: _departmentName,
  owningAgent,
  commandId,
  companyId,
}: {
  departmentName: string
  owningAgent?: string
  commandId?: string
  companyId: string
}) {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<"idle" | "started" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  const effectiveCommandId =
    commandId ??
    (owningAgent ? `sync-${owningAgent.replace(/-agent$/, "")}` : undefined)

  if (!effectiveCommandId) return null

  async function handleRun() {
    if (running || !effectiveCommandId) return
    setRunning(true)
    setStatus("idle")
    setMessage(null)

    try {
      const response = await runCompanyCommand(effectiveCommandId, {}, companyId)
      if (response.started) {
        setStatus("started")
        setMessage(response.message || "Agent run launched successfully")
      } else {
        setStatus("error")
        setMessage(response.message || "Could not launch agent run")
      }
    } catch (err: unknown) {
      setStatus("error")
      setMessage(err instanceof Error ? err.message : "Run failed")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={handleRun}
        disabled={running}
        className="px-3 py-1.5 rounded text-xs font-mono border border-primary/50 bg-primary/15 hover:bg-primary/25 text-primary disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
        title={`Run ${owningAgent ?? "department agent"} to reconcile records`}
      >
        {running ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Play className="size-3.5 fill-current" />
        )}
        <span>{running ? "Running…" : `Run ${owningAgent ?? "Agent"}`}</span>
      </button>

      {status === "started" && (
        <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded">
          <CheckCircle2 className="size-3" />
          <span>Running in background</span>
          <Link
            href={`/c/${companyId}/activity`}
            className="underline ml-1 hover:text-emerald-300"
          >
            Activity →
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-1 text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded">
          <AlertCircle className="size-3" />
          <span className="truncate max-w-[200px]" title={message ?? ""}>
            {message}
          </span>
        </div>
      )}
    </div>
  )
}
