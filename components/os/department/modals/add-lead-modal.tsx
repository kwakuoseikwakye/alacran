"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { createLeadAction } from "@/lib/os/records/actions"
import type { LeadStage } from "@/lib/os/schemas/funnel"
import { Loader2 } from "lucide-react"

export function AddLeadModal({
  companyId,
  isOpen,
  onClose,
  onSaved,
}: {
  companyId: string
  isOpen: boolean
  onSaved?: () => void
  onClose: () => void
}) {
  const [name, setName] = useState("")
  // Empty, not a sample value: whatever is left in a field is saved as a fact
  // about the user's business, and a $5,000 "outbound" deal was a guess.
  const [value, setValue] = useState("")
  const [stage, setStage] = useState<LeadStage>("new")
  const [source, setSource] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!name.trim()) {
      setError("Company or lead name is required")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await createLeadAction(companyId, {
        name: name.trim(),
        value: Math.max(0, Number(value) || 0),
        stage,
        source: source.trim() || "direct",
      })

      if (!res.ok) {
        setError(res.error)
        setLoading(false)
        return
      }

      setName("")
      setValue("")
      setStage("new")
      setSource("")
      setLoading(false)
      onSaved?.()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save lead")
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-w-md bg-background border border-border/80 text-foreground">
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Add New Sales Lead</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Record a prospective client or deal directly into your funnel.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div
              role="alert"
              className="mt-3 p-2 text-xs rounded bg-destructive/20 border border-destructive/40 text-destructive-foreground"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-3.5 py-4 text-xs font-mono">
            <div>
              <label className="block text-muted-foreground mb-1">Company / Lead Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Health Corp"
                className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary font-sans text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Deal Value ($ USD)</label>
                <input
                  type="number"
                  min="0"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-muted-foreground mb-1">Initial Stage</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as LeadStage)}
                  className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm capitalize"
                >
                  <option value="new">New</option>
                  <option value="qualified">Qualified</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-muted-foreground mb-1">Lead Source</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Inbound, Referral, Cold Outreach"
                className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs border border-border hover:bg-muted/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save &amp; Commit
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
