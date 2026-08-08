"use client"

import { useState } from "react"
import Link from "next/link"
import { saveGoogleAccounts } from "@/lib/save-google-accounts"

export const GOOGLE_ACCOUNTS_BLURB =
  "Pick which of your connected Google accounts this company's inbox commands (check-inbox, triage-email) check. Leave none checked to use gog's default account."

export function GoogleAccountsPicker({
  agentId,
  currentAccounts,
  availableAccounts,
}: {
  agentId: string
  currentAccounts: string[]
  availableAccounts: string[]
}) {
  const [selected, setSelected] = useState<string[]>(currentAccounts)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (availableAccounts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No Google accounts connected yet — connect one on the{" "}
        <Link href="/connect" className="text-primary underline-offset-4 hover:underline">
          Connect
        </Link>{" "}
        page.
      </p>
    )
  }

  async function toggle(email: string) {
    const previous = selected
    const next = selected.includes(email) ? selected.filter((e) => e !== email) : [...selected, email]
    setSelected(next)
    setPending(true)
    setMessage(null)
    const result = await saveGoogleAccounts(agentId, next)
    setPending(false)
    if (!result.ok) {
      setSelected(previous)
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Inbox accounts</p>
      <div className="space-y-1">
        {availableAccounts.map((email) => (
          <label key={email} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(email)}
              disabled={pending}
              onChange={() => void toggle(email)}
            />
            {email}
          </label>
        ))}
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
