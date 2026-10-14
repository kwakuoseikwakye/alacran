"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Check, Copy } from "lucide-react"
import type { CommsInquiry } from "@/lib/comms/inquiries"
import { approveInquiry, discardInquiry, markReplied } from "@/lib/comms/actions"

const URGENCY_CLASS: Record<CommsInquiry["urgency"], string> = {
  high: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
  medium: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  low: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
}

const primary = "px-3 py-1.5 rounded-lg bg-os-accent text-os-accent-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
const secondary = "px-3 py-1.5 rounded-lg border border-os-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"

export function InquiryCard({ inquiry, companyId }: { inquiry: CommsInquiry; companyId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: (companyId: string, fileName: string) => Promise<{ ok: boolean; message: string }>) {
    setBusy(true)
    setError(null)
    try {
      const res = await action(companyId, inquiry.fileName)
      if (res.ok) router.refresh()
      else setError(res.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(inquiry.draftReply)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Couldn't copy the draft.")
    }
  }

  return (
    <article className="rounded-xl border border-os-border bg-os-surface p-5 text-sm space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground truncate">{inquiry.from}</h3>
          <p className="text-sm text-foreground mt-0.5">{inquiry.subject}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {inquiry.channel} · {inquiry.receivedAt} · {inquiry.category}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${URGENCY_CLASS[inquiry.urgency]}`}>
          {inquiry.urgency}
        </span>
      </header>

      {inquiry.injectionFlag && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>This message tried to give Alacrán instructions. They were ignored — read it yourself before replying.</span>
        </div>
      )}

      {inquiry.asked && <p className="text-xs text-muted-foreground leading-relaxed">{inquiry.asked}</p>}

      {inquiry.context && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Context used</summary>
          <p className="whitespace-pre-wrap mt-1">{inquiry.context}</p>
        </details>
      )}

      <div className="rounded-lg bg-os-surface2 p-3 text-xs text-foreground/90 whitespace-pre-wrap border border-os-border">
        {inquiry.draftReply || "No draft was written for this one."}
      </div>

      {inquiry.status === "approved" && inquiry.threadHint && (
        <p className="text-xs text-muted-foreground">Reply in: {inquiry.threadHint}</p>
      )}

      {error && (
        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <footer className="pt-2 border-t border-os-border/60 flex flex-wrap gap-2">
        {inquiry.status === "pending" && (
          <>
            <button type="button" disabled={busy} onClick={() => run(approveInquiry)} className={primary}>Approve</button>
            <button type="button" disabled={busy} onClick={() => run(discardInquiry)} className={secondary}>Discard</button>
          </>
        )}
        {inquiry.status === "approved" && (
          <>
            <button type="button" disabled={!inquiry.draftReply} onClick={copyDraft} className={`${secondary} flex items-center gap-1.5`}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied" : "Copy draft"}</span>
            </button>
            <button type="button" disabled={busy} onClick={() => run(markReplied)} className={primary}>Mark replied</button>
          </>
        )}
      </footer>
    </article>
  )
}
