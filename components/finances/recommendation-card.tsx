"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Check, Copy, AlertTriangle, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react"
import type { FinancesRecommendation } from "@/lib/finances/recommendations"
import { approveRecommendation, discardRecommendation, markSavingsRealized } from "@/lib/finances/actions"

export interface RecommendationCardProps {
  recommendation: FinancesRecommendation
  companyId: string
}

export function RecommendationCard({ recommendation, companyId }: RecommendationCardProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showDetails, setShowDetails] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleCopyPitch = async () => {
    if (!recommendation.draftPitch) return
    try {
      await navigator.clipboard.writeText(recommendation.draftPitch)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Failed to copy outreach draft.")
    }
  }

  const handleApprove = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await approveRecommendation(companyId, recommendation.fileName)
      if (!res.ok) {
        setError(res.message)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDiscard = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await discardRecommendation(companyId, recommendation.fileName)
      if (!res.ok) {
        setError(res.message)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleMarkRealized = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await markSavingsRealized(
        companyId,
        recommendation.fileName,
        recommendation.potentialSavingsMonthly
      )
      if (!res.ok) {
        setError(res.message)
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const safeVendorUrl =
    recommendation.vendorUrl &&
    (recommendation.vendorUrl.startsWith("https://") || recommendation.vendorUrl.startsWith("http://"))
      ? recommendation.vendorUrl
      : null

  const currencySymbol = recommendation.currency === "USD" ? "$" : `${recommendation.currency} `

  const priorityColorClass =
    recommendation.priority === "high"
      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
      : recommendation.priority === "low"
        ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
        : "bg-amber-500/15 text-amber-400 border border-amber-500/30"

  const actionTypeBadgeClass =
    recommendation.actionType === "cancel"
      ? "bg-red-500/15 text-red-400 border border-red-500/30"
      : recommendation.actionType === "downgrade"
        ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
        : recommendation.actionType === "negotiate"
          ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"

  return (
    <article className="rounded-xl border border-os-border bg-os-surface p-5 text-sm space-y-4">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{recommendation.vendor}</h3>
            {safeVendorUrl && (
              <a
                href={safeVendorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-os-accent transition-colors"
                title={`Open ${recommendation.vendor} settings`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <p className="text-sm font-medium text-foreground mt-0.5">{recommendation.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{recommendation.category}</span>
            <span className="text-muted-foreground text-xs">·</span>
            <span className={`px-2 py-0.2 rounded-full text-xs font-medium uppercase tracking-wider ${actionTypeBadgeClass}`}>
              {recommendation.actionType}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="font-mono text-sm font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full">
            {`+${currencySymbol}${recommendation.potentialSavingsMonthly}/mo`}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${priorityColorClass}`}>
            {recommendation.priority} priority
          </span>
        </div>
      </header>

      {/* Finding & Rationale */}
      {recommendation.finding && (
        <div className="text-xs text-muted-foreground leading-relaxed bg-os-surface2/40 p-3 rounded-lg border border-os-border/50">
          <strong className="text-foreground font-medium block mb-0.5">Finding:</strong>
          {recommendation.finding}
        </div>
      )}

      {/* Collapsible Action Plan & Outreach Pitch */}
      {(recommendation.actionPlan || recommendation.draftPitch) && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{showDetails ? "Hide action & outreach draft" : "Show action & outreach draft"}</span>
            {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showDetails && (
            <div className="space-y-3 pt-1">
              {recommendation.actionPlan && (
                <div className="rounded-lg bg-os-surface2/60 p-3 text-xs text-foreground/90 border border-os-border/60">
                  <strong className="text-foreground font-medium block mb-1">Action Plan:</strong>
                  <p className="whitespace-pre-wrap">{recommendation.actionPlan}</p>
                </div>
              )}

              {recommendation.draftPitch && (
                <div className="rounded-lg bg-os-surface2 p-3 text-xs font-sans text-foreground/90 whitespace-pre-wrap border border-os-border space-y-1.5">
                  <div className="flex items-center justify-between text-muted-foreground pb-1 border-b border-os-border/50">
                    <span className="font-medium text-xs">Outreach Message Draft</span>
                  </div>
                  <p className="text-foreground/90">{recommendation.draftPitch}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Footer Actions */}
      <footer className="pt-2 border-t border-os-border/60 flex flex-wrap items-center justify-between gap-2">
        {recommendation.status === "pending" && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={busy}
              onClick={handleApprove}
              className="px-3 py-1.5 rounded-lg bg-os-accent text-os-accent-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? "Approving..." : "Approve"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDiscard}
              className="px-3 py-1.5 rounded-lg border border-os-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              {busy ? "Discarding..." : "Discard"}
            </button>
          </div>
        )}

        {recommendation.status === "approved" && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {recommendation.draftPitch && (
              <button
                type="button"
                onClick={handleCopyPitch}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-os-border bg-os-surface2 text-xs font-medium hover:bg-os-surface2/80 transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Copied!" : "Copy outreach draft"}</span>
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={handleMarkRealized}
              className="px-3 py-1.5 rounded-lg bg-os-accent text-os-accent-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? "Updating runway..." : "Mark savings realized"}
            </button>
          </div>
        )}

        {recommendation.status === "realized" && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1.5 rounded-lg">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-medium">Savings realized in runway record</span>
          </div>
        )}
      </footer>
    </article>
  )
}
