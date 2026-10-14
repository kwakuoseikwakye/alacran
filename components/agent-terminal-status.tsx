"use client"

import { useEffect, useState } from "react"
import { Terminal } from "lucide-react"
import { TERMINAL_STATUS_CHANGED_EVENT } from "@/lib/terminal-panel-event"
import type { CompanyTerminalStatus } from "@/lib/terminal/sessions"

export type AgentTerminalStatusProps = {
  agentId: string
  initialStatus?: CompanyTerminalStatus
  layout: "badge" | "callout" | "panel" | "spinner"
}

const DEFAULT_STATUS: CompanyTerminalStatus = {
  running: false,
  hasAiAgent: false,
  count: 0,
  labels: [],
}

/**
 * Live indicator shown on the company card when an agent or terminal session is running.
 *
 * Reads server-rendered initialStatus immediately on mount, then listens to
 * TERMINAL_STATUS_CHANGED_EVENT and polls /api/terminal-status every 3s to stay
 * in live sync without requiring page reloads.
 */
export function AgentTerminalStatus({
  agentId,
  initialStatus = DEFAULT_STATUS,
  layout,
}: AgentTerminalStatusProps) {
  const [status, setStatus] = useState<CompanyTerminalStatus>(initialStatus)

  useEffect(() => {
    let cancelled = false

    async function fetchStatus() {
      try {
        const res = await fetch("/api/terminal-status")
        if (!res.ok) return
        const data = (await res.json()) as { statusByAgent?: Record<string, CompanyTerminalStatus> }
        if (!cancelled && data.statusByAgent) {
          const agentStatus = data.statusByAgent[agentId] ?? DEFAULT_STATUS
          setStatus(agentStatus)
        }
      } catch {
        // Network or route errors are ignored — don't crash the card.
      }
    }

    function onStatusChange(e: Event) {
      const detail = (e as CustomEvent<{ agentId?: string }>).detail
      if (!detail?.agentId || detail.agentId === agentId) {
        void fetchStatus()
      }
    }

    window.addEventListener(TERMINAL_STATUS_CHANGED_EVENT, onStatusChange)
    const timer = setInterval(fetchStatus, 3000)

    return () => {
      cancelled = true
      window.removeEventListener(TERMINAL_STATUS_CHANGED_EVENT, onStatusChange)
      clearInterval(timer)
    }
  }, [agentId])

  if (!status.running) return null

  const labelText = status.hasAiAgent ? "Agent running in terminal" : "Terminal active"

  // The sidebar's Terminal item: no words, just a green ring turning.
  if (layout === "spinner") {
    return <span className="terminal-live-spinner" role="status" aria-label={labelText} title={labelText} />
  }

  if (layout === "badge") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] animate-pulse"
        title={`${labelText}${status.count > 1 ? ` (${status.count} sessions)` : ""}`}
      >
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <Terminal className="size-3 shrink-0" />
        <span>{status.hasAiAgent ? "Agent running" : "Terminal open"}</span>
      </span>
    )
  }

  if (layout === "callout") {
    return (
      <div
        className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
        role="status"
        aria-label={labelText}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <Terminal className="size-3.5 shrink-0 text-emerald-400" />
          <span className="font-semibold text-emerald-300">{labelText}</span>
        </div>
        {status.count > 1 && (
          <span className="font-mono text-[10px] text-emerald-400/80">
            {status.count} tabs
          </span>
        )}
      </div>
    )
  }

  // layout === "panel"
  return (
    <span
      className="company-pill flex items-center gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold shadow-[0_0_8px_rgba(16,185,129,0.2)]"
      role="status"
      aria-label={labelText}
    >
      <span className="relative flex size-1.5 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      <Terminal className="size-3 shrink-0 text-emerald-400" />
      {labelText}
    </span>
  )
}
