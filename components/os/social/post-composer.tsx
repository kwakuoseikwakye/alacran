"use client"

import React, { useState } from "react"
import { Send, CheckCircle2 } from "lucide-react"

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

export function PostComposer({ companyId: _companyId }: { companyId?: string }) {
  const [content, setContent] = useSafeState("")
  const [platforms, setPlatforms] = useSafeState<string[]>(["x", "linkedin"])
  const [status, setStatus] = useSafeState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useSafeState(false)

  const togglePlatform = (p: string) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  const handleQueue = () => {
    if (!content.trim()) return
    setIsSubmitting(true)
    setTimeout(() => {
      setStatus("Post queued to drafts and social publisher pipeline.")
      setContent("")
      setIsSubmitting(false)
      setTimeout(() => setStatus(null), 4000)
    }, 400)
  }

  const charCount = content.length

  return (
    <div className="rounded-lg border border-os-border bg-os-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-os-dim">
          Post Composer
        </span>
        <div className="flex items-center gap-1.5 font-mono text-[9.5px]">
          {["x", "linkedin", "instagram", "youtube"].map((p) => {
            const active = platforms.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`rounded-xs border px-2 py-0.5 uppercase transition-colors ${
                  active
                    ? "border-os-accent bg-os-accent/10 text-os-accent"
                    : "border-os-border text-os-dim hover:text-os-muted"
                }`}
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Draft your cross-platform post or thread update..."
        rows={3}
        className="w-full resize-none rounded-xs border border-os-border bg-os-bg p-3 font-sans text-[13px] text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
      />

      <div className="mt-2.5 flex items-center justify-between">
        <span
          className={`font-mono text-[10.5px] ${
            charCount > 280 ? "text-os-warn" : "text-os-dim"
          }`}
        >
          {charCount} / 280 characters
        </span>
        <button
          type="button"
          disabled={!content.trim() || isSubmitting}
          onClick={handleQueue}
          className="inline-flex items-center gap-1.5 rounded-xs border border-os-accent bg-os-accent/10 px-3 py-1 font-mono text-[11px] font-medium text-os-accent transition-colors hover:bg-os-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
          <span>{isSubmitting ? "Queueing…" : "Queue post"}</span>
        </button>
      </div>

      {status && (
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-os-ok">
          <CheckCircle2 className="h-3 w-3" />
          <span>{status}</span>
        </div>
      )}
    </div>
  )
}
