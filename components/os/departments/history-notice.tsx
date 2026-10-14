"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { retryCommitAction } from "@/lib/os/departments/actions"

/** Shown when a change is saved on disk but its history entry failed. Keeps the dialog open until the user retries or moves on. */
export function HistoryNotice({
  companyId, commitError, commitPaths, commitMessage, onDone,
}: { companyId: string; commitError?: string; commitPaths: string[]; commitMessage: string; onDone: () => void }) {
  const [detail, setDetail] = useState(commitError)
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    setRetrying(true)
    try {
      const res = await retryCommitAction(companyId, commitPaths, commitMessage)
      if (res.ok) return onDone()
      setDetail(res.error)
    } catch (err) {
      setDetail(err instanceof Error ? err.message : "Could not save history.")
    }
    setRetrying(false)
  }

  return (
    <div role="status" className="space-y-3">
      <p className="text-sm">Saved on this computer, but the history entry is missing.</p>
      {detail && detail.length <= 200 && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{detail}</p>}
      <div className="flex gap-2">
        <Button disabled={retrying} onClick={() => void retry()}>{retrying ? "Saving…" : "Try saving history again"}</Button>
        <Button variant="outline" disabled={retrying} onClick={onDone}>Continue without it</Button>
      </div>
    </div>
  )
}
