"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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
import { DiffView } from "@/components/diff-view"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"
import { commitCompanyCommandResult } from "@/lib/company-commands/commit-company-command-result"
import type { CompanyCommand } from "@/lib/company-commands/types"
import { getCompanyCommandLogTail } from "@/lib/company-commands/company-command-log-tail"
import { LogTailView } from "@/components/log-tail-view"

const POLL_INTERVAL_MS = 3000

export function CompanyCommandRunner({ command }: { command: CompanyCommand }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<CompanyCommandResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitMessage, setCommitMessage] = useState<string | null>(null)
  const [tail, setTail] = useState("")

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function pollUntilDone() {
    const status = await getCompanyCommandStatus()
    const logTail = await getCompanyCommandLogTail(command.id)
    setTail(logTail.tail)
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setRunning(false)
    const outcome = await getCompanyCommandResult(command.id)
    setResult(outcome)
  }

  async function handleRun() {
    setMessage(null)
    setResult(null)
    setCommitMessage(null)
    const response = await runCompanyCommand(command.id, values)
    setMessage(response.message)
    if (response.started) {
      setRunning(true)
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    }
  }

  async function handleConfirmCommit() {
    if (!result || !result.changed) return
    setCommitting(true)
    const response = await commitCompanyCommandResult(command.id, result.outputPath)
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
            <Textarea
              rows={field.multiline ? 4 : 1}
              value={values[field.key] ?? ""}
              onChange={(e) => setField(field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={running}
            />
          </div>
        ))}
      </div>

      <Button size="sm" onClick={handleRun} disabled={running}>
        {running ? "Running…" : `Run /${command.id}`}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {running && <LogTailView content={tail} />}

      {result && !result.changed && <p className="text-sm text-muted-foreground">{result.message}</p>}

      {result && result.changed && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-sm font-medium">{result.outputPath}</p>
          <DiffView oldText={result.oldText} newText={result.newText} />
          {result.extraFiles.length > 0 && (
            <p className="text-xs text-muted-foreground">Also created (not shown): {result.extraFiles.join(", ")}</p>
          )}
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={committing}>
            Confirm & commit
          </Button>
          {commitMessage && <p className="text-xs text-muted-foreground">{commitMessage}</p>}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Commit this result?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="max-h-[60vh] overflow-y-auto">
                {result && result.changed && <DiffView oldText={result.oldText} newText={result.newText} />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCommit}>Confirm &amp; commit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
