"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Check, Copy, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import type { Prospect } from "@/lib/leads-customers/prospects"
import { discardProspect, markProspectContacted } from "@/lib/leads-customers/actions"

export function ProspectCard({ prospect, agentId }: { prospect: Prospect; agentId: string }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showAngle, setShowAngle] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleCopy = async () => {
    if (!prospect.pitch) return
    await navigator.clipboard.writeText(prospect.pitch)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDiscard = async () => {
    setBusy(true)
    setError(null)
    const res = await discardProspect(agentId, prospect.fileName)
    if (!res.ok) {
      setError(res.message)
      setBusy(false)
    } else {
      router.refresh()
    }
  }

  const handleMarkContacted = async () => {
    setBusy(true)
    setError(null)
    const res = await markProspectContacted(agentId, prospect.fileName)
    if (!res.ok) {
      setError(res.message)
      setBusy(false)
    } else {
      router.refresh()
    }
  }

  const safeUrl = prospect.url.startsWith("https://") || prospect.url.startsWith("http://")
    ? prospect.url
    : null

  return (
    <article className="rounded-xl border border-os-border bg-os-surface p-5 text-sm space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{prospect.company}</h3>
            {safeUrl && (
              <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-os-accent" title="Open website">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{prospect.name} · {prospect.role}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            prospect.fitLevel === "high" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
          }`}>
            {prospect.fitScore}% Fit
          </span>
          <span className="font-mono text-xs text-muted-foreground">${prospect.estimatedValue.toLocaleString()}</span>
        </div>
      </header>

      {prospect.rationale && (
        <p className="text-xs text-muted-foreground leading-relaxed bg-os-surface2/40 p-2.5 rounded-lg border border-os-border/50">
          <strong className="text-foreground font-medium">Why they match:</strong> {prospect.rationale}
        </p>
      )}

      {prospect.pitch && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowAngle(!showAngle)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <span>Suggested outreach message</span>
            {showAngle ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showAngle && (
            <div className="relative rounded-lg bg-os-surface2 p-3 font-sans text-xs text-foreground/90 whitespace-pre-wrap border border-os-border">
              {prospect.pitch}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <footer className="pt-2 border-t border-os-border/60 flex flex-wrap items-center justify-between gap-2">
        {prospect.state === "waiting" ? (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={busy}
              onClick={() => router.push(`/c/${agentId}/tasks`)}
              className="px-3 py-1.5 rounded-lg bg-os-accent text-os-accent-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              Approve in queue →
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDiscard}
              className="px-3 py-1.5 rounded-lg border border-os-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-os-border bg-os-surface2 text-xs font-medium hover:bg-os-surface2/80"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied!" : "Copy pitch"}</span>
            </button>
            {prospect.state !== "contacted" && (
              <button
                type="button"
                disabled={busy}
                onClick={handleMarkContacted}
                className="px-3 py-1.5 rounded-lg bg-os-accent text-os-accent-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                Mark as contacted
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  )
}
