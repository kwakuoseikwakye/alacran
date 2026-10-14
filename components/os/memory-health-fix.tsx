"use client"

import { useState, useTransition } from "react"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"

export function fixResultText(r: { started: boolean; message: string }): string {
  return r.started ? "Started. It will show up in Approvals when it is ready." : r.message
}

/** Starts the normal `refresh` review. Nothing changes until the owner approves it in Approvals. */
export function MemoryHealthFix({ companyId, label }: { companyId: string; label: string }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState("")
  return (
    <span className="mh-fix">
      <button
        type="button"
        className="mh-btn"
        disabled={pending}
        title="Asks your AI to re-read recent notes and propose updates for you to approve. Nothing changes until you approve it."
        onClick={() =>
          start(async () => {
            try {
              setNote(fixResultText(await runCompanyCommand("refresh", {}, companyId)))
            } catch {
              setNote("Couldn't start that. Try again.")
            }
          })
        }
      >
        {label}
      </button>
      {note && <small role="status">{note}</small>}
    </span>
  )
}
