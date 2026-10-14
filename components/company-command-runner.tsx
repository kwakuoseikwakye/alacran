"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
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
import { DiffView } from "@/components/diff-view"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"
import { commitCompanyCommandResult } from "@/lib/company-commands/commit-company-command-result"
import { discardCompanyCommandResult } from "@/lib/company-commands/discard-company-command-result"
import { ChangeSummaryView } from "@/components/change-summary-view"
import type { CompanyCommand } from "@/lib/company-commands/types"
import { isSchedulableCommand } from "@/lib/company-commands/registry"
import { getScheduleStatus, setSchedule } from "@/lib/schedules/schedule-actions"
// Type-only: schedules-impl imports node:fs/promises, so a value import here
// would pull it into the client bundle and fail the build (v61's lesson).
import type { LastRun } from "@/lib/schedules/schedules-impl"
import { AdvancedOnly } from "@/components/advanced-only"
import { getCompanyCommandLogTail } from "@/lib/company-commands/company-command-log-tail"
import { LogTailView } from "@/components/log-tail-view"
import { StrayFilesNotice } from "@/components/stray-files-notice"

const POLL_INTERVAL_MS = 3000

export function CompanyCommandRunner({ command, agentId }: { command: CompanyCommand; agentId: string }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<CompanyCommandResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitMessage, setCommitMessage] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const router = useRouter()
  const [tail, setTail] = useState("")
  const [scheduleTime, setScheduleTime] = useState("")
  const [savedTime, setSavedTime] = useState("")
  const [autoCommit, setAutoCommit] = useState(false)
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)

  // Both reads, both idempotent — this is a catch-up for a result nobody has
  // approved yet (the 07:00 run you're looking at over coffee at 09:00), not
  // a trigger, so the Strict-Mode double-invoke guard the spawning components
  // need doesn't apply here. Only a result with real changes is shown, so a
  // command that has never run looks exactly as it did before this existed.
  useEffect(() => {
    let cancelled = false
    getCompanyCommandResult(command.id, agentId)
      .then((outcome) => {
        // `changed` alone was the condition here, which hid the worst case: a
        // run that produced no expected output but DID edit other files would
        // load as nothing at all. A pending review exists if either is true.
        if (!cancelled && (outcome.changed || (outcome.strays?.length ?? 0) > 0)) setResult(outcome)
      })
      .catch(() => {})
    getScheduleStatus(agentId, command.id)
      .then((status) => {
        if (cancelled) return
        setScheduleTime(status.time ?? "")
        setSavedTime(status.time ?? "")
        setAutoCommit(status.autoCommit)
        setLastRun(status.lastRun)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [command.id, agentId])

  async function saveSchedule(time: string | null, commitItself = autoCommit) {
    const response = await setSchedule(agentId, command.id, time, commitItself)
    setScheduleMessage(response.message)
    if (response.saved) setSavedTime(time ?? "")
  }

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function pollUntilDone() {
    const status = await getCompanyCommandStatus(agentId)
    const logTail = await getCompanyCommandLogTail(command.id, agentId)
    setTail(logTail.tail)
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
    const outcome = await getCompanyCommandResult(command.id, agentId)
    setResult(outcome)
  }

  async function handleRun() {
    setMessage(null)
    setResult(null)
    setCommitMessage(null)
    const response = await runCompanyCommand(command.id, values, agentId)
    setMessage(response.message)
    if (response.started) {
      setRunning(true)
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    }
  }

  // The first diff a new user ever sees is this one, so "no" has to be a
  // button next to "yes" rather than the absence of one.
  async function handleDiscard() {
    setDiscarding(true)
    const response = await discardCompanyCommandResult(command.id, agentId)
    setDiscarding(false)
    setDiscardOpen(false)
    setCommitMessage(response.message)
    if (response.discarded) {
      setResult(null)
      // Same reason as the Tasks board: the pending count is server-rendered.
      router.refresh()
    }
  }

  async function handleConfirmCommit() {
    if (!result || !result.changed) return
    setCommitting(true)
    const response = await commitCompanyCommandResult(command.id, result.outputPath, agentId)
    if (response.committed) router.refresh()
    setCommitting(false)
    setConfirmOpen(false)
    setCommitMessage(response.message)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {command.fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-sm font-medium">
              {field.label}
              {field.required && " *"}
            </label>
            {field.multiline ? (
              <Textarea
                rows={4}
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={running}
              />
            ) : (
              <Input
                value={values[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={running}
              />
            )}
          </div>
        ))}
      </div>

      <Button size="sm" onClick={handleRun} disabled={running}>
        {running ? "Running…" : `Run /${command.id}`}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {running && <LogTailView content={tail} />}

      {result && !result.changed && <p className="text-sm text-muted-foreground">{result.message}</p>}

      {/* Rendered for BOTH outcomes, and outside the `changed` block on
          purpose: "this job produced nothing, but it edited four other files"
          is the case most worth seeing, and it used to render as a bare
          "No changes produced." */}
      {result && <StrayFilesNotice strays={result.strays} />}

      {result && result.changed && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-sm font-medium">{result.outputPath}</p>
          <ChangeSummaryView
            oldText={result.oldText}
            newText={result.newText}
            outputPath={result.outputPath}
          />
          <DiffView oldText={result.oldText} newText={result.newText} />
          {result.extraFiles.length > 0 && (
            <p className="text-xs text-muted-foreground">Also created (not shown): {result.extraFiles.join(", ")}</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={committing || discarding}>
              Keep
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDiscardOpen(true)} disabled={committing || discarding}>
              {discarding ? "Discarding…" : "Discard"}
            </Button>
          </div>
          {commitMessage && <p className="text-xs text-muted-foreground">{commitMessage}</p>}
        </div>
      )}

      {isSchedulableCommand(command) && (
        <AdvancedOnly>
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Run this every day, on its own</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="h-8 w-32 text-xs"
                aria-label="Time of day to run this command"
              />
              <Button size="sm" variant="outline" onClick={() => saveSchedule(scheduleTime || null)} disabled={!scheduleTime}>
                Save
              </Button>
              {savedTime && (
                <Button size="sm" variant="ghost" onClick={() => saveSchedule(null, false)}>
                  Turn off
                </Button>
              )}
            </div>
            {!command.untrustedInput && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoCommit}
                  onChange={(e) => setAutoCommit(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Commit the result for me, without asking</span>
              </label>
            )}
            <p className="text-xs text-muted-foreground">
              {autoCommit
                ? "Alacrán runs it while you're away and commits the result itself. You'll find it as a real commit in this company's git history rather than a diff waiting here — so you can still read it after the fact, and still undo it."
                : "Alacrán runs it while you're away and leaves the result right here, as a diff waiting for you — nothing is committed without you approving it."}{" "}
              Alacrán has to be running for this to happen.
            </p>
            {command.untrustedInput && (
              <p className="text-xs text-muted-foreground">
                This one always waits for you: it reads text written by people outside this company, so nobody but you
                should be the first to read what it produced.
              </p>
            )}
            {lastRun && (
              <p className="text-xs text-muted-foreground">
                Last automatic run: {lastRun.date} — {lastRun.message}
              </p>
            )}
            {scheduleMessage && <p className="text-xs text-muted-foreground">{scheduleMessage}</p>}
          </div>
        </AdvancedOnly>
      )}

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Throw this away?</AlertDialogTitle>
            <AlertDialogDescription>
              {result && result.changed
                ? `${result.outputPath} goes back to how it was before this ran. There's no undo.`
                : "There's no undo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it for now</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard} disabled={discarding}>
              Throw it away
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Keep this?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] overflow-y-auto">
                {result && result.changed && <DiffView oldText={result.oldText} newText={result.newText} />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCommit}>Keep</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
