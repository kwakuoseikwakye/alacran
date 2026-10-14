"use client"

import { useState } from "react"
import {
  updateLeadStageAction,
  updateTransactionStatusAction,
  updateContentStageAction,
} from "@/lib/os/records/actions"
import type { LeadStage } from "@/lib/os/schemas/funnel"
import type { TransactionStatus } from "@/lib/os/schemas/finances"
import type { ContentStatus } from "@/lib/os/schemas/content"
import { Loader2 } from "lucide-react"

export function LeadStageStepper({
  companyId,
  leadId,
  currentStage,
}: {
  companyId: string
  leadId: string
  currentStage: LeadStage
}) {
  const [stage, setStage] = useState(currentStage)
  const [loading, setLoading] = useState(false)

  async function handleChange(next: LeadStage) {
    if (next === stage || loading) return
    const prev = stage
    setStage(next)
    setLoading(true)
    try {
      const res = await updateLeadStageAction(companyId, leadId, next)
      if (!res.ok) {
        setStage(prev)
      }
    } catch {
      setStage(prev)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label={`Update stage for ${leadId}`}
        value={stage}
        disabled={loading}
        onChange={(e) => handleChange(e.target.value as LeadStage)}
        className="px-2 py-0.5 rounded text-[11px] font-mono capitalize border border-border/80 bg-muted/40 hover:bg-muted/60 text-foreground cursor-pointer focus:outline-none focus:border-primary transition-colors"
      >
        <option value="new">New</option>
        <option value="qualified">Qualified</option>
        <option value="negotiation">Negotiation</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </select>
      {loading ? <Loader2 className="w-3 h-3 animate-spin ml-1 text-muted-foreground" /> : null}
    </div>
  )
}

export function TransactionStatusStepper({
  companyId,
  txnId,
  currentStatus,
}: {
  companyId: string
  txnId: string
  currentStatus: TransactionStatus
}) {
  const [status, setStatus] = useState(currentStatus)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (loading) return
    const next: TransactionStatus = status === "cleared" ? "pending" : "cleared"
    const prev = status
    setStatus(next)
    setLoading(true)
    try {
      const res = await updateTransactionStatusAction(companyId, txnId, next)
      if (!res.ok) {
        setStatus(prev)
      }
    } catch {
      setStatus(prev)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      aria-label={`Update status for ${txnId}`}
      onClick={toggle}
      disabled={loading}
      className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize border transition-colors inline-flex items-center gap-1 ${
        status === "cleared"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          : "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
      }`}
    >
      {status}
      {loading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
    </button>
  )
}

export function ContentStatusStepper({
  companyId,
  itemId,
  currentStatus,
}: {
  companyId: string
  itemId: string
  currentStatus: ContentStatus
}) {
  const [status, setStatus] = useState(currentStatus)
  const [loading, setLoading] = useState(false)

  async function handleChange(next: ContentStatus) {
    if (next === status || loading) return
    const prev = status
    setStatus(next)
    setLoading(true)
    try {
      const res = await updateContentStageAction(companyId, itemId, next)
      if (!res.ok) {
        setStatus(prev)
      }
    } catch {
      setStatus(prev)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label={`Update status for ${itemId}`}
        value={status}
        disabled={loading}
        onChange={(e) => handleChange(e.target.value as ContentStatus)}
        className="px-2 py-0.5 rounded text-[11px] font-mono capitalize border border-border/80 bg-muted/40 hover:bg-muted/60 text-foreground cursor-pointer focus:outline-none focus:border-primary transition-colors"
      >
        <option value="idea">Idea</option>
        <option value="draft">Draft</option>
        <option value="review">Review</option>
        <option value="scheduled">Scheduled</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      {loading ? <Loader2 className="w-3 h-3 animate-spin ml-1 text-muted-foreground" /> : null}
    </div>
  )
}
