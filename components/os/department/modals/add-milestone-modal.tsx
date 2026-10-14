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
import { createMilestoneAction } from "@/lib/os/records/actions"
import { Loader2 } from "lucide-react"

/** This quarter and the next five, as the schema's YYYY-QX. */
export function upcomingQuarters(now = new Date(), count = 6): string[] {
  const out: string[] = []
  let year = now.getFullYear()
  let q = Math.floor(now.getMonth() / 3) + 1
  for (let i = 0; i < count; i++) {
    out.push(`${year}-Q${q}`)
    q += 1
    if (q > 4) {
      q = 1
      year += 1
    }
  }
  return out
}

export function AddMilestoneModal({
  companyId,
  isOpen,
  onClose,
}: {
  companyId: string
  isOpen: boolean
  onClose: () => void
}) {
  const quarters = upcomingQuarters()
  const [title, setTitle] = useState("")
  const [quarter, setQuarter] = useState(quarters[1])
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!title.trim()) {
      setError("Say what you want to get done")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await createMilestoneAction(companyId, { title: title.trim(), quarter, description })
      if (!res.ok) {
        setError(res.error)
        setLoading(false)
        return
      }
      setTitle("")
      setDescription("")
      setLoading(false)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't save the milestone")
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-w-md bg-[#0a0d14] border border-border/80 text-foreground">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="font-display text-lg">Add a milestone</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Something you want to get done, and roughly when.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div role="alert" className="mt-3 p-2 text-xs rounded bg-destructive/20 border border-destructive/40 text-destructive-foreground">
              {error}
            </div>
          ) : null}

          <div className="space-y-3.5 py-4 text-sm">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">What do you want to get done? *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Open a second kitchen"
                className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">By when?</label>
              <select
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary"
              >
                {quarters.map((q) => (
                  <option key={q} value={q}>
                    {q.replace("-", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Why it matters, or what done looks like"
                className="w-full min-h-20 px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded text-xs border border-border hover:bg-muted/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
