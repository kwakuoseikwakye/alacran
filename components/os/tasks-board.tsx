"use client"

import { ExecutorGapNote } from "@/components/executor-gap-note"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
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
import { Button } from "@/components/ui/button"
import { getRevisionHistory, requestRevision } from "@/lib/company-commands/request-revision"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { Textarea } from "@/components/ui/textarea"
import { DiffView } from "@/components/diff-view"
import { StrayFilesNotice } from "@/components/stray-files-notice"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import { commitCompanyCommandResult } from "@/lib/company-commands/commit-company-command-result"
import { discardCompanyCommandResult } from "@/lib/company-commands/discard-company-command-result"
import { batchCommitSafeReviews } from "@/lib/company-commands/batch-approve"
import { APPLY_FAILED, ApproveButtons, FactNotices, LiveFactsPanel, ProposedFactsPanel, approveAndApply, deriveFactState, tickedLines } from "./fact-changes-panel"
import { discardOwnedChanges } from "@/lib/company-commands/discard-owned-changes"
import { applySessionFacts } from "@/lib/company-commands/apply-session-facts"
import { flyToApprovals } from "@/components/os/motion"
import { Thinking } from "@/components/os/thinking"
import { classifyRisk, type RiskAssessment } from "@/lib/company-commands/risk-tier"
import { computeDiffStats, type DiffStats } from "@/lib/company-commands/diff-stats"
import { describeProfile } from "@/lib/company-commands/profile-preview"
import { ChangeSummaryView } from "@/components/change-summary-view"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"
import type { PendingReview } from "@/lib/company-commands/pending-reviews"
import { approvalTitle } from "@/lib/os/approval-title"
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCheck,
  Code2,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

function readablePreview(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[-*]\s+/gm, "• ")
    .trim()

}

/** The company profile is said as sentences; every other file keeps the raw-text preview. */
function previewText(outputPath: string, text: string): string {
  return describeProfile(outputPath, text) ?? readablePreview(text)
}

function RiskBadge({ risk }: { risk: RiskAssessment }) {
  if (risk.level === "low") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <ShieldCheck className="w-3.5 h-3.5" />
        {risk.label}
      </span>
    )
  }
  if (risk.level === "medium") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <ShieldAlert className="w-3.5 h-3.5" />
        {risk.label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
      <AlertTriangle className="w-3.5 h-3.5" />
      {risk.label}
    </span>
  )
}

function DiffStatsPill({ stats }: { stats: DiffStats }) {
  return (
    <div className="inline-flex items-center gap-1.5 font-mono text-xs font-medium">
      {stats.linesAdded > 0 && (
        <span className="text-emerald-400">+{stats.linesAdded}</span>
      )}
      {stats.linesRemoved > 0 && (
        <span className="text-rose-400">-{stats.linesRemoved}</span>
      )}
      {stats.linesAdded === 0 && stats.linesRemoved === 0 && (
        <span className="text-muted-foreground">0 lines</span>
      )}
    </div>
  )
}

function TaskCard({
  review,
  onDone,
  onResultLoaded,
}: {
  review: PendingReview
  onDone: () => void
  onResultLoaded?: (review: PendingReview, result: CompanyCommandResult, risk: RiskAssessment) => void
}) {
  const [result, setResult] = useState<CompanyCommandResult | null>(null)
  const [loading, setLoading] = useState(true)
  const revisionTrigger = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLLIElement>(null)
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getRevisionHistory>> | null>(null)
  const [feedback, setFeedback] = useState("")
  const [revising, setRevising] = useState(false)
  const [running, setRunning] = useState(false)
  const [reload, setReload] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [showRawDiff, setShowRawDiff] = useState(false)
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const { owned, ownedPaths, proposed, brokenYaml } = deriveFactState(review.commandId, result)
  // What the owner is shown: commit and drop refuse if the owned files no longer match it (v234).
  const expectedOwned = owned.map((f) => ({ path: f.path, newText: f.newText }))
  const [applyFailed, setApplyFailed] = useState<string | null>(null)
  const [ticks, setTicks] = useState<boolean[]>([])
  useEffect(() => {
    // Re-derive only when a new result loads; `proposed` is recomputed from it every render.
    setTicks(proposed.state === "ok" ? proposed.facts.map((f) => f.kind !== "unconfirmed") : [])
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    getCompanyCommandResult(review.commandId, review.agentId)
      .then((r) => {
        if (!cancelled) {
          setResult(r)
          if (r.changed) {
            const risk = classifyRisk({
              commandId: review.commandId,
              outputPath: r.outputPath,
              oldText: r.oldText,
              newText: r.newText,
              extraFiles: r.extraFiles,
              strays: r.strays,
              ownedPaths: r.ownedFiles?.map((f) => f.path),
            })
            onResultLoaded?.(review, r, risk)
          }
        }
      })
      .catch(() => { if (!cancelled) setMessage("Could not load this proposal. Try again.") })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [review.commandId, review.agentId, review, onResultLoaded, reload])

  useEffect(() => {
    let cancelled = false
    let wasRunning = running
    const check = async () => {
      try {
        const status = await getCompanyCommandStatus(review.agentId)
        if (cancelled) return
        setRunning(status.running)
        if (wasRunning && !status.running) setReload((value) => value + 1)
        wasRunning = status.running
      } catch { /* Keep the last known status until the next check. */ }
    }
    void check()
    const timer = setInterval(check, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [review.agentId, revising, running])

  async function handleRevision() {
    if (!result?.changed || !feedback.trim()) return
    setRevising(true)
    setMessage(null)
    try {
      const response = await requestRevision(review.commandId, review.agentId, {
        feedback, outputPath: result.outputPath, expectedText: result.newText,
      })
      if (response.started) {
        setRunning(true)
        setRevisionOpen(false)
        setFeedback("")
        setMessage("Preparing your revision. The previous draft is kept in local history; the revision will still need your approval.")
      } else setMessage(response.message)
    } catch { setMessage("Could not request a revision. Your draft is still here. Try again.") }
    finally { setRevising(false) }
  }

  async function handleConfirm() {
    if (!result || !result.changed) return
    setCommitting(true)
    try {
    const response = await commitCompanyCommandResult(review.commandId, result.outputPath, review.agentId, result.newText, expectedOwned)
    setCommitting(false)
    setConfirmOpen(false)
    setMessage(response.message)
    if (response.committed) {
      if (result.extraFiles.length > 0) setReload((value) => value + 1)
      else {
        // Saved already; the card flies into the sidebar's count, then goes.
        await flyToApprovals(card.current)
        onDone()
      }
      router.refresh()
    }
    } catch { setMessage("Could not save the proposal. Please try again.") }
    finally { setCommitting(false) }
  }

  async function finishAfterApply() {
    // The note is already saved: a failed animation must not surface as "Could not save the note".
    await flyToApprovals(card.current).catch(() => {})
    onDone()
    router.refresh()
  }

  async function handleApproveAndApply() {
    if (committing || !result?.changed || proposed.state !== "ok") return
    setCommitting(true)
    try {
      const out = await approveAndApply({
        commit: () => commitCompanyCommandResult(review.commandId, result.outputPath, review.agentId, result.newText, expectedOwned),
        apply: (note, lines) => applySessionFacts(review.agentId, note, lines),
        note: result.outputPath,
        lines: tickedLines(proposed, ticks),
      })
      if (out.kind === "save-failed") setMessage(out.message)
      else if (out.kind === "saved-apply-failed") { setApplyFailed(out.message); setMessage(null) }
      else {
        setMessage("Saved the note. The fact changes are being written and will wait here for your review.")
        await finishAfterApply()
      }
    } catch { setMessage("Could not save the note. Please try again.") }
    finally { setCommitting(false) }
  }

  async function handleRetryApply() {
    if (committing || !result?.changed || proposed.state !== "ok") return
    setCommitting(true)
    try {
      const applied = await applySessionFacts(review.agentId, result.outputPath, tickedLines(proposed, ticks))
      if (applied.started) {
        setApplyFailed(null)
        setMessage("The fact changes are being written and will wait here for your review.")
        await finishAfterApply()
      } else setApplyFailed(`${APPLY_FAILED} ${applied.message}`.trim())
    } catch { setApplyFailed(APPLY_FAILED) }
    finally { setCommitting(false) }
  }

  async function handleDropFacts() {
    if (committing || discarding) return
    setDiscarding(true)
    try {
      const res = await discardOwnedChanges(review.commandId, review.agentId, expectedOwned)
      setMessage(res.message)
      if (res.discarded) setReload((v) => v + 1)
    } catch { setMessage("Could not drop the fact changes. Please try again.") }
    finally { setDiscarding(false) }
  }

  async function handleDiscard() {
    setDiscarding(true)
    try {
    const response = await discardCompanyCommandResult(review.commandId, review.agentId, expectedOwned)
    setDiscarding(false)
    setDiscardOpen(false)
    setMessage(response.message)
    if (response.discarded) {
      onDone()
      router.refresh()
    }
    } catch { setMessage("Could not discard the proposal. Please try again.") }
    finally { setDiscarding(false) }
  }

  const risk = result && result.changed
    ? classifyRisk({
        commandId: review.commandId,
        outputPath: result.outputPath,
        oldText: result.oldText,
        newText: result.newText,
        extraFiles: result.extraFiles,
        strays: result.strays,
        ownedPaths,
      })
    : null

  const diffStats = result && result.changed ? computeDiffStats(result.oldText, result.newText) : null

  return (
    <li ref={card} className="tasks-card">
      <header className="tasks-card-head flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Ready for your decision</p>
          <h2 className="mt-1 font-display text-lg font-bold">{approvalTitle(review.commandId)}</h2>
        </div>
        {risk && (
          <div className="flex items-center gap-2">
            {diffStats && <DiffStatsPill stats={diffStats} />}
            <RiskBadge risk={risk} />
          </div>
        )}
      </header>

      {loading && <p className="brain-empty">Loading proposal…</p>}
      {!loading && result && !result.changed && <p className="brain-empty">{result.message}</p>}
      {!loading && result && result.changed && risk && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
            <span>{result.outputPath.split("/").pop()}</span>
            <span className="italic">{risk.reason}</span>
          </div>

          <StrayFilesNotice strays={result.strays} />
          {owned.length > 0 && <LiveFactsPanel ownedFiles={owned} commandId={review.commandId} />}
          {proposed.state === "ok" && (
            <ProposedFactsPanel facts={proposed.facts} checked={ticks}
              onToggle={(i) => setTicks((t) => t.map((v, j) => (j === i ? !v : v)))} />
          )}
          {applyFailed && <p className="fact-panel-note" role="alert">{applyFailed}</p>}
          <FactNotices proposedState={proposed.state} brokenYaml={brokenYaml} />

          <ChangeSummaryView
            oldText={result.oldText}
            newText={result.newText}
            outputPath={result.outputPath}
          />

          <section className="approval-readable-preview" aria-label="Readable preview">
            <div className="flex items-center justify-between">
              <span>What Alacrán wants to save</span>
              <span className="text-xs text-muted-foreground">{result.outputPath.split("/").pop()}</span>
            </div>
            <p>{previewText(result.outputPath, result.newText)}</p>
          </section>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowRawDiff(!showRawDiff)}
              className="h-8 px-2 text-xs text-muted-foreground inline-flex items-center gap-1.5"
            >
              <Code2 className="w-3.5 h-3.5" />
              {showRawDiff ? "Hide technical details" : "Show technical details"}
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showRawDiff && "rotate-180")} />
            </Button>

            {showRawDiff && (
              <div className="mt-2 rounded border border-os-border bg-os-surface2 p-3 overflow-x-auto">
                <DiffView oldText={result.oldText} newText={result.newText} />
              </div>
            )}
          </div>

          <details onToggle={(event) => {
            if (event.currentTarget.open) void getRevisionHistory(review.commandId, review.agentId).then(setHistory).catch(() => setMessage("Could not load previous drafts. Try again."))
          }}>
            <summary className="cursor-pointer text-sm">Previous drafts</summary>
            {history === null ? <p role="status">Loading previous drafts…</p> : history.length === 0 ? <p className="text-sm">No revisions have been requested yet.</p> : history.map((entry) => <section className="my-3 rounded border border-os-border p-3 text-sm" key={entry.createdAt}>
              <p className="font-semibold">Before: {entry.feedback}</p><p className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap">{readablePreview(entry.proposal)}</p>
            </section>)}
          </details>

          {result.extraFiles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Other documents will stay pending for separate review: {result.extraFiles.join(", ")}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {applyFailed ? (
              <>
                <Button size="sm" onClick={handleRetryApply} disabled={committing}>Try again</Button>
                <Button size="sm" variant="outline" onClick={() => { onDone(); router.refresh() }} disabled={committing}>Close</Button>
              </>
            ) : (
              <>
                <ApproveButtons
                  commandId={review.commandId}
                  proposedState={proposed.state}
                  hasOwned={owned.length > 0}
                  tickedCount={ticks.filter(Boolean).length}
                  brokenYaml={brokenYaml}
                  busy={committing || discarding || revising || running}
                  onApproveAndApply={handleApproveAndApply}
                  onApprove={() => setConfirmOpen(true)}
                  onDropFacts={handleDropFacts}
                />
              </>
            )}
            {!applyFailed && (
              <>
            <Button size="sm" variant="outline" ref={revisionTrigger} onClick={() => setRevisionOpen(true)} disabled={committing || discarding || revising || running}>
              Ask for changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDiscardOpen(true)} disabled={running || revising || committing || discarding}>Discard</Button>
              </>
            )}
          </div>
          <ExecutorGapNote agentId={review.agentId} need="revise" />
          {running && <p className="flex items-center gap-2" role="status"><Thinking label="Preparing changes" /> Preparing changes… Review will be available when the work finishes.</p>}
        </>
      )}
      {message && <p role="status" className="brain-empty mt-2">{message}</p>}

      <AlertDialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); revisionTrigger.current?.focus() }}>
          <AlertDialogHeader>
            <AlertDialogTitle>What should change?</AlertDialogTitle>
            <AlertDialogDescription>Your current draft will be kept in local history. The revised draft will come back here for review.</AlertDialogDescription>
          </AlertDialogHeader>
          <label htmlFor={`revision-${review.commandId}`}>Your feedback</label>
          <Textarea id={`revision-${review.commandId}`} value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={4000} placeholder="Describe what to correct, add, or remove." autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revising}>Cancel</AlertDialogCancel>
            <Button disabled={!feedback.trim() || revising || running} onClick={handleRevision}>{revising ? "Requesting…" : "Request revision"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              {result && result.changed
                ? `This proposal will be removed and ${result.outputPath} will stay as it was before the run. This cannot be undone.`
                : "This proposal will be removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it for now</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard} disabled={discarding || running}>
              Remove proposal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <div className="flex items-center justify-between gap-2 pr-4">
              <AlertDialogTitle>Approve this change?</AlertDialogTitle>
              {risk && <RiskBadge risk={risk} />}
            </div>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pt-2">
                {result && <StrayFilesNotice strays={result.strays} />}
                {result && result.changed && (
                  <ChangeSummaryView
                    oldText={result.oldText}
                    newText={result.newText}
                    outputPath={result.outputPath}
                  />
                )}
                {result && result.changed && (
                  <div className="space-y-3 text-sm">
                    {result.oldText && <section><h3 className="font-semibold">Before</h3><p className="whitespace-pre-wrap">{previewText(result.outputPath, result.oldText)}</p></section>}
                    <section><h3 className="font-semibold">What will be saved</h3><p className="whitespace-pre-wrap">{previewText(result.outputPath, result.newText)}</p></section>
                    <details><summary className="cursor-pointer">Technical details</summary><DiffView oldText={result.oldText} newText={result.newText} /></details>
                  </div>
                )}
                {result && result.changed && result.extraFiles.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Other documents will stay pending for separate review: {result.extraFiles.join(", ")}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={committing || running}>
              Save to company memory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

export function TasksBoard({
  reviews,
  companyId,
  justSaved,
  suppressEmpty,
}: {
  reviews: PendingReview[]
  /** Only for the empty state's link to Ask; unknown company, no link. */
  companyId?: string
  /** The first approval just happened (see savedRecently): say it is saved. */
  justSaved?: boolean
  /** Something else on the page is waiting (the guide update), so "Nothing waiting on you." would be false. */
  suppressEmpty?: boolean
}) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [selectedKey, setSelectedKey] = useState<string | null>(reviews[0] ? `${reviews[0].agentId}:${reviews[0].commandId}` : null)
  const [resultsMap, setResultsMap] = useState<
    Record<string, { result: CompanyCommandResult; risk: RiskAssessment }>
  >({})
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null)
  const router = useRouter()

  const key = (r: PendingReview) => `${r.agentId}:${r.commandId}`
  const visible = reviews.filter((r) => !done.has(key(r)))

  const handleResultLoaded = useCallback((
    review: PendingReview,
    result: CompanyCommandResult,
    risk: RiskAssessment
  ) => {
    setResultsMap((prev) => ({
      ...prev,
      [key(review)]: { result, risk },
    }))
  }, [])

  const safeReviews = visible.filter((r) => {
    const entry = resultsMap[key(r)]
    return entry && entry.risk.isSafe && entry.result.changed && entry.result.extraFiles.length === 0
  })

  async function handleApproveAllSafe() {
    const itemsToCommit = safeReviews.map((r) => {
      const entry = resultsMap[key(r)]
      return {
        commandId: r.commandId,
        agentId: r.agentId,
        outputPath: entry.result.changed ? entry.result.outputPath : "",
      }
    })

    if (itemsToCommit.length === 0) return
    setBatchLoading(true)
    setBatchFeedback(null)

    try {
      const res = await batchCommitSafeReviews(itemsToCommit)
      setBatchLoading(false)
      if (res.committed.length > 0) {
        setDone((prev) => {
          const next = new Set(prev)
          for (const k of res.committed) next.add(k)
          return next
        })
        setBatchFeedback(res.message)
        router.refresh()
      } else {
        setBatchFeedback(res.message)
      }
    } catch (err) {
      setBatchLoading(false)
      setBatchFeedback(err instanceof Error ? err.message : "Batch approval failed")
    }
  }

  if (visible.length === 0) {
    return (
      <div>
        {batchFeedback && (
          <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
            {batchFeedback}
          </div>
        )}
        {justSaved && (
          <p role="status" className="mb-2 text-sm font-medium">
            Saved. Alacrán keeps it in your company&apos;s files.
          </p>
        )}
        {!suppressEmpty && (
          <>
            <p className="brain-empty">Nothing waiting on you.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              When Alacrán drafts something, like a summary, a decision, or an update to your company profile, it waits here until you say yes.
            </p>
            {companyId && (
              <Link href={`/c/${companyId}/ask`} className="mt-3 inline-block text-sm underline">
                Ask Alacrán to prepare something
              </Link>
            )}
          </>
        )}
      </div>
    )
  }

  const governedCount = visible.length - safeReviews.length
  const selected = (visible.find((review) => key(review) === selectedKey) ?? visible[0])!

  return (
    <div className="native-approvals">
      <aside className="native-approvals-list">
        <div className="native-approvals-tabs"><button className="active">Waiting <span>{visible.length}</span></button><button>History</button></div>
        {visible.map((review) => (
          <button key={key(review)} type="button" onClick={() => setSelectedKey(key(review))} className={key(review) === key(selected) ? "active" : ""}>
            <span>{approvalTitle(review.commandId)}</span>
            <small>Ready for your decision</small>
          </button>
        ))}
        <p>Alacran only places consequential changes here. Nothing is saved without your approval.</p>
      </aside>
      <div className="native-approvals-detail space-y-4">
      {/* Smart Gate Risk-Tier Summary Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg bg-os-surface2 border border-os-border">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-os-text">
              {visible.length} pending review{visible.length === 1 ? "" : "s"}
            </span>
            {safeReviews.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                {safeReviews.length} safe to batch approve
              </span>
            )}
            {governedCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                {governedCount} need individual review
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Review the summaries before saving. Changes to company facts, agreements, or money need individual review.
          </p>
        </div>

        {safeReviews.length > 0 && (
          <Button
            size="sm"
            onClick={handleApproveAllSafe}
            disabled={batchLoading}
            className="whitespace-nowrap flex items-center gap-1.5"
          >
            {batchLoading ? (
              <Thinking label="Approving" />
            ) : (
              <CheckCheck className="w-4 h-4" />
            )}
            {batchLoading
              ? "Saving…"
              : `Approve All Safe (${safeReviews.length})`}
          </Button>
        )}
      </div>

      {batchFeedback && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
          {batchFeedback}
        </div>
      )}

      <ul className="tasks-board">
        {[selected].map((r) => (
          <TaskCard
            key={key(r)}
            review={r}
            onDone={() => setDone((prev) => new Set(prev).add(key(r)))}
            onResultLoaded={handleResultLoaded}
          />
        ))}
      </ul>
      </div>
    </div>
  )
}
