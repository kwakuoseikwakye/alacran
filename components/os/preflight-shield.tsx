"use client"

import React from "react"
import { ShieldAlert, AlertTriangle, ShieldCheck, Copy, Check } from "lucide-react"
import { useState } from "react"
import type { PreflightReport, PreflightCheckResult } from "@/lib/os/doctor/preflight"
import { Button } from "@/components/ui/button"

function RemediationCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function copyToClipboard() {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-1 flex items-center justify-between rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-os-text border border-os-border">
      <span className="truncate pr-2">{code}</span>
      <button
        type="button"
        onClick={copyToClipboard}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Copy remediation snippet"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

function CheckItem({ check }: { check: PreflightCheckResult }) {
  const isFail = check.status === "fail"
  return (
    <div
      className={`rounded-md p-2.5 text-xs border ${
        isFail
          ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
      }`}
    >
      <div className="flex items-center gap-2 font-medium">
        {isFail ? (
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        )}
        <span>{check.title}</span>
      </div>
      <p className="mt-1 text-[11.5px] text-foreground/90">{check.message}</p>
      {check.remediation && check.remediation.includes(":") ? (
        <RemediationCode code={check.remediation.split(":").slice(1).join(":").trim()} />
      ) : check.remediation ? (
        <p className="mt-1 text-[10.5px] text-muted-foreground italic">{check.remediation}</p>
      ) : null}
    </div>
  )
}

export function PreflightShield({
  report,
  onDismiss,
}: {
  report: PreflightReport
  onDismiss?: () => void
}) {
  if (report.ok) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
        <ShieldCheck className="w-4 h-4" />
        <span>Pre-flight checks passed. Workspace and runtime are clean.</span>
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg border p-4 shadow-lg backdrop-blur-sm space-y-3 ${
        !report.canProceed
          ? "border-rose-500/40 bg-rose-950/20"
          : "border-amber-500/40 bg-amber-950/20"
      }`}
      role="alert"
      aria-label="Pre-flight runtime shield report"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {!report.canProceed ? (
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {!report.canProceed
                ? "Pre-Flight Shield Blocked Execution"
                : "Pre-Flight Notice"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {!report.canProceed
                ? "Issues detected that would cause command failures or corruption if dispatched."
                : "Operational notices to review before dispatching."}
            </p>
          </div>
        </div>

        {onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Dismiss
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {report.blockers.map((blocker) => (
          <CheckItem key={blocker.id} check={blocker} />
        ))}
        {report.warnings.map((warn) => (
          <CheckItem key={warn.id} check={warn} />
        ))}
      </div>
    </div>
  )
}
