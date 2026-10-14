"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import { UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, X } from "lucide-react"

const POLL_INTERVAL_MS = 3000

export interface AuditFinancesFormProps {
  companyId: string
  initialCash?: number
  initialBurn?: number
}

export function AuditFinancesForm({
  companyId,
  initialCash,
  initialBurn,
}: AuditFinancesFormProps) {
  const router = useRouter()
  const [cashBalance, setCashBalance] = useState(initialCash != null && initialCash > 0 ? String(initialCash) : "")
  const [monthlyBurn, setMonthlyBurn] = useState(initialBurn != null && initialBurn > 0 ? String(initialBurn) : "")
  const [prompt, setPrompt] = useState("")
  const [statementText, setStatementText] = useState("")
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      setStatementText(text)
      setUploadedFileName(file.name)
    } catch {
      setError("Failed to read CSV file.")
    }
  }

  const handleClearFile = () => {
    setUploadedFileName(null)
    setStatementText("")
  }

  const [auditing, setAuditing] = useState(false)

  // Started from submit, not an effect, so Strict Mode can't start it twice (same as MakePostsForm).
  async function pollUntilDone() {
    try {
      if ((await getCompanyCommandStatus(companyId)).running) {
        setTimeout(pollUntilDone, POLL_INTERVAL_MS)
        return
      }
      const outcome = await getCompanyCommandResult("audit-finances", companyId)
      if (outcome.changed) setSuccess("Audit finished. New recommendations are below.")
      else setError(outcome.message)
    } catch {
      setError("Couldn't check on the audit. Reload the page to see new recommendations.")
    }
    setAuditing(false)
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || auditing) return
    setLoading(true)
    setError(null)
    setSuccess(null)

    // Field values go to the command as strings; its buildPrompt parses "$150,000"-style input.
    const fields = {
      cashBalance: cashBalance.trim(),
      monthlyBurn: monthlyBurn.trim(),
      prompt: prompt.trim(),
      statementText: statementText.trim(),
    }

    try {
      const r = await runCompanyCommand("audit-finances", fields, companyId)
      if (!r.started) throw new Error(r.message)
      setSuccess("Financial audit started. Recommendations appear below when it finishes.")
      setPrompt("")
      setStatementText("")
      setUploadedFileName(null)
      setAuditing(true)
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl rounded-xl border border-os-border bg-os-surface p-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">Audit spend & runway</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Provide your current financial state or statement export to uncover cost savings and update cash runway.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="cash-balance" className="block text-xs font-medium text-foreground">
            Current cash on hand ($)
          </label>
          <input
            id="cash-balance"
            type="number"
            min={0}
            step="any"
            value={cashBalance}
            onChange={(e) => setCashBalance(e.target.value)}
            placeholder="e.g. 150000"
            className="mt-1 block w-full rounded-lg border border-os-border bg-os-surface2 px-3 py-2 text-sm text-foreground focus:border-os-accent focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="monthly-burn" className="block text-xs font-medium text-foreground">
            Estimated monthly burn ($)
          </label>
          <input
            id="monthly-burn"
            type="number"
            min={0}
            step="any"
            value={monthlyBurn}
            onChange={(e) => setMonthlyBurn(e.target.value)}
            placeholder="e.g. 12000"
            className="mt-1 block w-full rounded-lg border border-os-border bg-os-surface2 px-3 py-2 text-sm text-foreground focus:border-os-accent focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label htmlFor="audit-prompt" className="block text-xs font-medium text-foreground">
          Focus area / custom instructions (optional)
        </label>
        <textarea
          id="audit-prompt"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Check for unused software seats, review monthly cloud server charges, or look for annual billing discounts"
          className="mt-1 block w-full rounded-lg border border-os-border bg-os-surface2 px-3 py-2 text-sm text-foreground focus:border-os-accent focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="statement-csv" className="block text-xs font-medium text-foreground mb-1">
          Upload statement or transaction CSV (optional)
        </label>
        
        {uploadedFileName ? (
          <div className="flex items-center justify-between rounded-lg border border-os-border bg-os-surface2 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-foreground font-mono truncate">
              <FileSpreadsheet className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="truncate">{uploadedFileName}</span>
            </div>
            <button
              type="button"
              onClick={handleClearFile}
              className="text-muted-foreground hover:text-foreground ml-2"
              title="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              id="statement-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="sr-only"
            />
            <label
              htmlFor="statement-csv"
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-os-border bg-os-surface2/50 px-4 py-3 text-xs text-muted-foreground hover:border-os-accent hover:text-foreground cursor-pointer transition-colors"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Click to upload bank or credit card CSV export</span>
            </label>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || auditing}
        className="px-4 py-2 rounded-lg bg-os-accent text-os-accent-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? "Starting financial audit..." : auditing ? "Auditing…" : "Audit finances"}
      </button>
    </form>
  )
}
