"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DiffView } from "@/components/diff-view"
import { LogTailView } from "@/components/log-tail-view"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import { getCompanyCommandLogTail } from "@/lib/company-commands/company-command-log-tail"
import { commitCompanyCommandResult } from "@/lib/company-commands/commit-company-command-result"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"

const POLL_INTERVAL_MS = 3000
const DEFINE_COMPANY_COMMAND_ID = "define-company"

export function DefineCompanyAiDraft({
  agentId,
  fieldValues,
  onCancel,
  onCommitted,
}: {
  agentId: string
  fieldValues: Record<string, string>
  onCancel: () => void
  onCommitted: () => void
}) {
  const [phase, setPhase] = useState<"running" | "finished">("running")
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<CompanyCommandResult | null>(null)
  const [tail, setTail] = useState("")
  const [committing, setCommitting] = useState(false)
  const startedRef = useRef(false)

  async function pollUntilDone() {
    const status = await getCompanyCommandStatus(agentId)
    const logTail = await getCompanyCommandLogTail(DEFINE_COMPANY_COMMAND_ID, agentId)
    setTail(logTail.tail)
    if (status.running) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      return
    }
    setPhase("finished")
    const outcome = await getCompanyCommandResult(DEFINE_COMPANY_COMMAND_ID, agentId)
    setResult(outcome)
  }

  async function start() {
    setMessage(null)
    const response = await runCompanyCommand(DEFINE_COMPANY_COMMAND_ID, fieldValues, agentId)
    setMessage(response.message)
    if (response.started) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    } else {
      setPhase("finished")
    }
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConfirmCommit() {
    if (!result || !result.changed) return
    setCommitting(true)
    const response = await commitCompanyCommandResult(DEFINE_COMPANY_COMMAND_ID, result.outputPath, agentId)
    setCommitting(false)
    if (response.committed) {
      onCommitted()
    } else {
      setMessage(response.message)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Asking the AI to draft tailored customer/org/product entities from your answers…
      </p>
      {message && <p className="text-xs text-destructive">{message}</p>}
      {phase === "running" && <LogTailView content={tail} />}
      {phase === "finished" && result && !result.changed && (
        <p className="text-sm text-muted-foreground">{result.message}</p>
      )}
      {phase === "finished" && result && result.changed && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-sm font-medium">{result.outputPath}</p>
          <DiffView oldText={result.oldText} newText={result.newText} />
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={committing}>
          Cancel and save with generic entities instead
        </Button>
        {phase === "finished" && result && result.changed && (
          <Button size="sm" onClick={handleConfirmCommit} disabled={committing}>
            {committing ? "Committing…" : "Confirm & commit"}
          </Button>
        )}
      </div>
    </div>
  )
}
