"use client"

import { useEffect, useState } from "react"
import { FileText } from "lucide-react"
import { DiffView } from "@/components/diff-view"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { runsApi, type RunSummary } from "@/lib/agent-runs/client"
import { plainSummary, riskyPaths } from "@/lib/agent-runs/run-view"
import type { RunChange } from "@/lib/agent-runs/landing"

type Tab = { id: string; kind: "ai"; label: string }
const STATUS_LETTER: Record<RunChange["status"], string> = { A: "Added", M: "Changed", D: "Deleted", T: "Changed" }
const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`

/**
 * The decision strip at the foot of a finished run's pane: the agent's own
 * last words, then what a person can do about them. It is the one place in the
 * grid allowed to draw the eye.
 */
export function AgentRunReview({
  agentId,
  run,
  companyName,
  onLanded,
  onTakenOver,
  onAsked,
}: {
  agentId: string
  run: RunSummary
  companyName: string
  onLanded: (message: string) => void
  onTakenOver: (tab: Tab) => void
  onAsked: (label: string) => void
}) {
  const [changes, setChanges] = useState<{ files: RunChange[]; ignored: string[] } | null>(null)
  const [changesFailed, setChangesFailed] = useState(false)
  const [message, setMessage] = useState<{ text: string; files?: string[] } | null>(null)
  const [asking, setAsking] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [busy, setBusy] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // The file list is what the risky-file line and the discard confirm name;
  // fetched once per finish, not polled.
  useEffect(() => {
    let cancelled = false
    setChangesFailed(false)
    void runsApi.changes(agentId, run.id).then((c) => {
      if (cancelled) return
      setChanges(c)
      setChangesFailed(!c)
    })
    return () => {
      cancelled = true
    }
  }, [agentId, run.id, run.endedAt])

  const risky = riskyPaths(changes?.files.map((f) => f.path) ?? [])
  const act = async (fn: () => Promise<{ ok: boolean; message?: string; files?: string[] }>, done?: (r: never) => void) => {
    setBusy(true)
    setMessage(null)
    const result = await fn()
    setBusy(false)
    if (!result.ok) return setMessage({ text: result.message ?? "That didn't work.", files: result.files })
    done?.(result as never)
  }

  const words = plainSummary(
    run.summary ?? run.reason ?? (run.changedFiles ? `Changed ${files(run.changedFiles)}.` : "Finished without changing anything.")
  )
  // Nothing to keep and nothing that would be lost: a plain Dismiss, no confirm.
  const empty = run.changedFiles === 0 && changes !== null && changes.files.length === 0 && changes.ignored.length === 0

  return (
    <div className="run-review" role="group" aria-label={`Review ${run.title}`}>
      <p className="run-review-words">{words}</p>
      {risky.length > 0 && (
        <p className="run-review-risky">
          Includes {risky.length === 1 ? "a file that changes" : "files that change"} how tools run here: {risky.join(", ")}.
          Look at {risky.length === 1 ? "it" : "them"} before keeping.
        </p>
      )}
      {message && (
        <p className="run-review-message" role="alert">
          {message.text}
        </p>
      )}

      {asking ? (
        <form
          className="run-review-ask"
          onSubmit={(e) => {
            e.preventDefault()
            void act(() => runsApi.ask(agentId, run.id, feedback), (r: { label: string }) => {
              setAsking(false)
              setFeedback("")
              onAsked(r.label)
            })
          }}
        >
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What should the agent change?"
            rows={2}
            autoFocus
            aria-label="What should the agent change?"
          />
          <div className="run-review-actions">
            <button type="submit" className="run-btn run-btn--primary" disabled={busy || !feedback.trim()}>
              Send back
            </button>
            <button type="button" className="run-btn" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="run-review-actions">
          {run.changedFiles > 0 && (
            <button type="button" className="run-btn" onClick={() => setDrawerOpen(true)}>
              <FileText className="size-3.5" aria-hidden />
              View changes
            </button>
          )}
          {run.changedFiles > 0 && (
            <button
              type="button"
              className="run-btn run-btn--primary"
              disabled={busy}
              onClick={() => void act(() => runsApi.keep(agentId, run.id), (r: { message: string }) => onLanded(r.message))}
            >
              Keep changes
            </button>
          )}
          <button type="button" className="run-btn" disabled={busy} onClick={() => setAsking(true)}>
            Ask for changes
          </button>
          <button
            type="button"
            className="run-btn"
            disabled={busy}
            onClick={() => void act(() => runsApi.takeOver(agentId, run.id), (r: { id: string; label: string }) => onTakenOver({ id: r.id, kind: "ai", label: r.label }))}
          >
            Take over
          </button>
          {empty ? (
            <button
              type="button"
              className="run-btn run-btn--quiet"
              disabled={busy}
              onClick={() => void act(() => runsApi.discard(agentId, run.id), (r: { message: string }) => onLanded(r.message))}
            >
              Dismiss
            </button>
          ) : (
            <button type="button" className="run-btn run-btn--quiet" disabled={busy} onClick={() => setConfirmOpen(true)}>
              Discard
            </button>
          )}
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{run.title}</SheetTitle>
            <SheetDescription>
              What this agent changed in its own copy of {companyName}. Nothing here is in the company until you keep it.
            </SheetDescription>
          </SheetHeader>
          <ChangesList agentId={agentId} runId={run.id} changes={changes} />
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Throw away this agent&apos;s work?</AlertDialogTitle>
            <AlertDialogDescription>
              {!changes ? (
                changesFailed ? (
                  "Couldn't check what this would delete. Close this and try again."
                ) : (
                  "Checking what this would delete…"
                )
              ) : (
                <>
              {run.changedFiles > 0 ? `This deletes its changes to ${files(run.changedFiles)}` : "This deletes its copy"}
              {changes && changes.ignored.length > 0
                ? `, and ${files(changes.ignored.length)} it made that aren't saved with the company (${changes.ignored.slice(0, 3).join(", ")}${changes.ignored.length > 3 ? "…" : ""})`
                : ""}
              . {companyName} stays as it is. This can&apos;t be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              // Discard is irreversible: the confirm may only go ahead once it
              // has named everything it deletes, ignored files included.
              disabled={!changes}
              onClick={() => void act(() => runsApi.discard(agentId, run.id), (r: { message: string }) => onLanded(r.message))}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** The drawer's body: one row per file, and the selected file's before and after. */
function ChangesList({
  agentId,
  runId,
  changes,
}: {
  agentId: string
  runId: string
  changes: { files: RunChange[]; ignored: string[] } | null
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ before: string; after: string; notice?: string } | null>(null)
  const [diffFailed, setDiffFailed] = useState(false)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setDiff(null)
    setDiffFailed(false)
    void runsApi.fileDiff(agentId, runId, open).then((d) => {
      if (cancelled) return
      setDiff(d)
      setDiffFailed(!d)
    })
    return () => {
      cancelled = true
    }
  }, [agentId, runId, open])

  if (!changes) return <p className="run-drawer-empty">Loading…</p>
  return (
    <div className="run-drawer">
      <ul className="run-drawer-files">
        {changes.files.map((f) => (
          <li key={f.path}>
            <button type="button" aria-expanded={open === f.path} onClick={() => setOpen(open === f.path ? null : f.path)}>
              <span className="run-drawer-kind">{STATUS_LETTER[f.status]}</span>
              <span className="run-drawer-path">{f.path}</span>
            </button>
            {open === f.path && (
              <div className="run-drawer-diff">{diff ? diff.notice ?? <DiffView oldText={diff.before} newText={diff.after} /> : diffFailed ? "Couldn't load this file's changes." : "Loading…"}</div>
            )}
          </li>
        ))}
      </ul>
      {changes.ignored.length > 0 && (
        <p className="run-drawer-ignored">
          It also made {files(changes.ignored.length)} that aren&apos;t saved with the company ({changes.ignored.join(", ")}). They aren&apos;t kept,
          and discarding deletes them.
        </p>
      )}
    </div>
  )
}
