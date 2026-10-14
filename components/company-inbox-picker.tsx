"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { saveCompanyInbox } from "@/lib/save-company-inbox"

export const COMPANY_INBOX_BLURB =
  "Which of the inboxes set up on this computer this company reads. Leave it unchosen and it uses the first one, the way it always has."

/**
 * Picks one of the machine's inboxes for this company.
 *
 * Labelled by address rather than by slot: "Inbox 2" is a fact about a config
 * file, and the person choosing knows their own email address instead. The
 * slot number is what gets written, because that is what the INBOX_n_USER /
 * _PASS / _HOST triple is keyed by.
 *
 * Empty offers exactly one way out — Connections — the same as an empty
 * credential row.
 */
export function CompanyInboxPicker({
  agentId,
  options,
  currentSlot,
}: {
  agentId: string
  options: { slot: number; email: string }[]
  currentSlot: number | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (options.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Inbox</p>
        <p className="text-xs text-muted-foreground">
          No inbox set up on this computer yet — add one in{" "}
          <Link href="/system/connectors" className="text-primary underline-offset-4 hover:underline">
            Connections
          </Link>
          .
        </p>
      </div>
    )
  }

  async function handleChange(next: string) {
    setPending(true)
    setMessage(null)
    const result = await saveCompanyInbox(agentId, next === "" ? null : Number(next))
    setPending(false)
    if (result.ok) router.refresh()
    else setMessage(result.message)
  }

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground" htmlFor={`inbox-${agentId}`}>
        Inbox
      </label>
      <select
        id={`inbox-${agentId}`}
        value={currentSlot === null ? "" : String(currentSlot)}
        disabled={pending}
        onChange={(e) => void handleChange(e.target.value)}
        className="flex h-9 w-full min-w-0 rounded-md border border-os-border bg-os-surface px-3 py-1 text-xs text-os-text shadow-xs transition-colors outline-none focus-visible:border-os-accent focus-visible:ring-1 focus-visible:ring-os-accent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="" className="bg-os-surface text-os-text">
          Not chosen — uses the first inbox
        </option>
        {options.map((option) => (
          <option key={option.slot} value={option.slot} className="bg-os-surface text-os-text">
            {option.email}
          </option>
        ))}
      </select>
      {pending && <p className="text-xs text-muted-foreground">Saving…</p>}
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
