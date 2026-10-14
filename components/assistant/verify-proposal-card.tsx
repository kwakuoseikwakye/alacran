"use client"

import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import type { ActionProposal } from "@/lib/assistant/action-envelope"
import { runCompanyVerify } from "@/lib/run-verify"
import type { VerifyResult } from "@/lib/run-verify-impl"

/** The headline, then one line per check. The status is a word, so the result is not colour-only. */
export function summariseVerify(result: VerifyResult): string[] {
  if (!result.ran) return [result.message]
  return [result.message, ...result.rows.map((row) => `${row.status} — ${row.message}`)]
}

const COULDNT_RUN: VerifyResult = { ran: false, passed: false, rows: [], message: "Couldn't run the checks. Try again." }

export function VerifyProposalCard({ proposal, onActed }: { proposal: ActionProposal; onActed?: () => void }) {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle")
  const [result, setResult] = useState<VerifyResult | null>(null)

  // Only ever called from a button click: rendering, replay and speech never run anything.
  async function run() {
    onActed?.()
    setResult(null) // so "Running the checks…" never sits above the previous run's rows
    setPhase("running")
    try {
      setResult(await runCompanyVerify(proposal.companyId))
      setPhase("done")
    } catch {
      setResult(COULDNT_RUN)
      setPhase("idle")
    }
  }

  return (
    <div
      className="mt-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-foreground shadow-md backdrop-blur-sm dark:bg-amber-950/25"
      role="region"
      aria-label="Proposed action"
    >
      <div className="font-semibold text-sm text-foreground">{proposal.label}</div>
      <p className="mt-1 text-sm text-muted-foreground">Runs this company&apos;s own checks. Nothing is changed.</p>

      {result ? (
        <div role="status" className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded border border-border bg-background/80 p-2 text-sm dark:bg-black/40">
          {summariseVerify(result).map((line, i) => (
            <div key={i} className={`break-words ${i === 0 ? "font-semibold" : ""}`}>{line}</div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {phase === "running" ? (
          <span className="text-sm text-amber-600 dark:text-amber-300">Running the checks…</span>
        ) : (
          <button
            type="button"
            onClick={() => void run()}
            title="Run this company's own checks. Nothing is changed."
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {result ? "Run again" : "Run the checks"}
          </button>
        )}
      </div>
    </div>
  )
}
