"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { ActionProposal } from "@/lib/assistant/action-envelope"
import { planRemovalAction, removeDepartmentAction } from "@/lib/os/departments/actions"
import type { RemovalPlan } from "@/lib/os/departments/mutations"
import { HistoryNotice } from "@/components/os/departments/history-notice"

type Status = "loading" | "ready" | "removing" | "history-failed" | "removed" | "dismissed"
type Loaded = { plan: RemovalPlan; revision: string }
/** A removal that is on disk but whose history entry failed: what the retry needs. */
type History = { paths: string[]; message: string; error?: string }

/**
 * What removing really does, in the words the owner sees. A populated department's folder is MOVED into
 * the archive (a rename, recorded in history): nothing is deleted. An empty department has no files; its
 * empty placeholder folder (and the .gitkeep inside it) is DELETED, so the wording says so.
 */
export function describeRemoval(plan: RemovalPlan): string {
  if (plan.kind === "empty") return "This department is empty, so there are no files to lose. It will be removed from the list and its empty folder will be deleted."
  const files = plan.fileCount === 1 ? "1 file" : `${plan.fileCount} files`
  return `This department holds ${files}. They will be moved to ${plan.archiveTarget}, so nothing is deleted, and the department will be removed from the list.`
}

const CHANGED = "The department list changed while you were working. Check what will happen, then press Remove department again."
const UNREACHABLE = "Couldn't confirm the result. Check the department list before trying again."

export function RemoveDepartmentProposalCard({ proposal, onActed }: { proposal: ActionProposal; onActed?: () => void }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("loading")
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const startedRef = useRef(false)
  const slug = proposal.fields.slug ?? ""

  // Read-only: looks at the department and what removing it would do. Nothing is changed.
  async function load() {
    try {
      const res = await planRemovalAction(proposal.companyId, slug)
      if (res.ok) setLoaded({ plan: res.plan, revision: res.revision })
      else setError(res.error)
    } catch {
      setError("Couldn't look at that department. Try again.")
    }
    setStatus("ready")
  }

  // Strict Mode runs this effect twice in development; the ref makes it one look.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === "dismissed") return null

  // Only ever called from the button: rendering, replay and speech never remove anything.
  async function remove() {
    if (!loaded) return
    onActed?.()
    setStatus("removing")
    setError(null)
    let res
    try {
      res = await removeDepartmentAction(proposal.companyId, { slug, expectedRevision: loaded.revision, confirm: loaded.plan })
    } catch {
      setError(UNREACHABLE)
      setStatus("ready")
      return
    }
    if (!res.ok) {
      setError(res.code === "conflict" ? CHANGED : res.error)
      if (res.code === "conflict" || res.code === "stale") {
        // The plan the owner saw is out of date. Drop it, so no Remove button sits on the old one, and look again.
        setLoaded(null)
        setStatus("loading")
        void load()
      } else setStatus("ready")
      return
    }
    if (res.committed) setStatus("removed")
    else {
      setHistory({ paths: res.commitPaths, message: res.commitMessage, error: res.commitError })
      setStatus("history-failed")
    }
    router.refresh()
  }

  const finished = status === "removed" || status === "history-failed"
  return (
    <div role="region" aria-label="Proposed removal" className="mt-2.5 rounded-lg border border-border bg-card p-3 text-sm shadow-md">
      <div className="font-semibold">{proposal.label}</div>
      {!finished && <p className="text-xs text-muted-foreground">Nothing is removed until you press the button.</p>}
      {status === "loading" && <p className="mt-2">Looking at the department…</p>}
      {loaded && !finished && <p className="mt-2">{describeRemoval(loaded.plan)}</p>}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
      {status === "history-failed" && history && (
        <div className="mt-3">
          <HistoryNotice companyId={proposal.companyId} commitError={history.error} commitPaths={history.paths} commitMessage={history.message} onDone={() => setStatus("removed")} />
        </div>
      )}
      {status !== "history-failed" && <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === "removed" ? (
          <span className="font-medium">Removed.</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={!loaded || status !== "ready"}
              className="rounded-md bg-destructive px-3 py-1.5 font-semibold text-white disabled:opacity-60"
            >
              {status === "removing" ? "Removing…" : "Remove department"}
            </button>
            <button type="button" onClick={() => setStatus("dismissed")} disabled={status === "removing"} className="rounded-md border border-border px-2.5 py-1.5 text-muted-foreground disabled:opacity-60">Keep it</button>
          </>
        )}
      </div>}
    </div>
  )
}
