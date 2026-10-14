"use client"

import { useEffect, useRef, useState } from "react"
import { DefineCompanyDraftView } from "@/components/define-company-draft-view"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import { getCompanyCommandLogTail } from "@/lib/company-commands/company-command-log-tail"
import type { CompanyCommandResult } from "@/lib/company-commands/company-command-result-impl"

const POLL_INTERVAL_MS = 3000
const DEFINE_COMPANY_COMMAND_ID = "define-company"

export function DefineCompanyAiDraft({
  agentId,
  fieldValues,
  onBack,
  onReviewReady,
}: {
  agentId: string
  fieldValues: Record<string, string>
  onBack: () => void
  /** The draft is ready and waiting in Approvals: close this and go there. */
  onReviewReady: () => void
}) {
  const [phase, setPhase] = useState<"running" | "finished">("running")
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<CompanyCommandResult | null>(null)
  const [tail, setTail] = useState("")
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
    setResult(await getCompanyCommandResult(DEFINE_COMPANY_COMMAND_ID, agentId))
  }

  async function start() {
    setMessage(null)
    const response = await runCompanyCommand(DEFINE_COMPANY_COMMAND_ID, fieldValues, agentId)
    if (response.started) {
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    } else {
      // Only a start that did not happen is an error worth showing; "started"
      // used to be printed here in the error colour too.
      setMessage(response.message)
      setPhase("finished")
    }
  }

  // Starts a real, paid run on mount: React Strict Mode double-invokes effects
  // in development, so this must be guarded (see AGENTS.md).
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finished = phase === "finished"
  return (
    <DefineCompanyDraftView
      phase={phase}
      changed={finished && !!result?.changed}
      noChangeMessage={finished && result && !result.changed ? result.message : null}
      message={message}
      tail={tail}
      onReview={onReviewReady}
      onBack={onBack}
    />
  )
}
