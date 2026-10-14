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
import { createContentItemAction } from "@/lib/os/records/actions"
import type { ContentStatus, ContentType } from "@/lib/os/schemas/content"
import { Loader2 } from "lucide-react"

export function AddContentModal({
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
  const [title, setTitle] = useState("")
  const [channel, setChannel] = useState("blog")
  const [type, setType] = useState<ContentType>("article")
  const [status, setStatus] = useState<ContentStatus>("idea")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!title.trim()) {
      setError("Title is required")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await createContentItemAction(companyId, {
        title: title.trim(),
        channel: channel.trim() || "blog",
        type,
        status,
      })

      if (!res.ok) {
        setError(res.error)
        setLoading(false)
        return
      }

      setTitle("")
      setChannel("blog")
      setType("article")
      setStatus("idea")
      setLoading(false)
      onSaved?.()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save content item")
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
            <DialogTitle className="font-display text-lg">Draft New Content</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Add an idea, draft, or article to your publishing queue.
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
              <label className="block text-muted-foreground mb-1">Content Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Why Local-First AI Matters"
                className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary font-sans text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-muted-foreground mb-1">Channel</label>
                <input
                  type="text"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="e.g. blog, twitter, newsletter"
                  className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-muted-foreground mb-1">Format / Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ContentType)}
                  className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm capitalize"
                >
                  <option value="article">Article</option>
                  <option value="post">Social Post</option>
                  <option value="newsletter">Newsletter</option>
                  <option value="documentation">Documentation</option>
                  <option value="changelog">Changelog</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-muted-foreground mb-1">Initial Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ContentStatus)}
                className="w-full px-3 py-2 rounded bg-muted/20 border border-border text-foreground focus:outline-none focus:border-primary text-sm capitalize"
              >
                <option value="idea">Idea</option>
                <option value="draft">Draft</option>
                <option value="review">Review</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
              </select>
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
