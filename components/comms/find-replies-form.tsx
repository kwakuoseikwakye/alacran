"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"
import { FIND_REPLIES_COMMAND_ID } from "@/lib/comms/paths"

const POLL_INTERVAL_MS = 3000
const input = "mt-1 block w-full rounded-lg border border-os-border bg-os-surface2 px-3 py-2 text-sm text-foreground focus:border-os-accent focus:outline-none"

export function FindRepliesForm({ companyId }: { companyId: string }) {
  const router = useRouter()
  const [sinceDays, setSinceDays] = useState("3")
  const [focus, setFocus] = useState("")
  const [pastedThread, setPastedThread] = useState("")
  const [pending, setPending] = useState(false)
  const [looking, setLooking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Started from submit, not an effect, so Strict Mode can't start it twice (same as MakePostsForm).
  async function pollUntilDone() {
    try {
      if ((await getCompanyCommandStatus(companyId)).running) {
        setTimeout(pollUntilDone, POLL_INTERVAL_MS)
        return
      }
      const outcome = await getCompanyCommandResult(FIND_REPLIES_COMMAND_ID, companyId)
      setMessage(outcome.changed ? null : outcome.message)
    } catch {
      setMessage("Couldn't check on the job. Reload the page to see new cards.")
    }
    setLooking(false)
    router.refresh()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending || looking) return
    setPending(true)
    setMessage(null)
    try {
      const r = await runCompanyCommand(FIND_REPLIES_COMMAND_ID, { sinceDays, focus, pastedThread }, companyId)
      setMessage(r.started ? null : r.message)
      if (r.started) {
        setPastedThread("")
        setLooking(true)
        setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't start. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl rounded-xl border border-os-border bg-os-surface p-5">
      <p className="text-xs text-muted-foreground">
        Alacrán reads what your chat, email and Notion checks already saved, and drafts a reply for anything still waiting on you. It never sends anything.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-xs font-medium text-foreground">
          Look back
          <select value={sinceDays} onChange={(e) => setSinceDays(e.target.value)} className={input}>
            {["1", "3", "7", "14"].map((d) => (
              <option key={d} value={d}>{d === "1" ? "1 day" : `${d} days`}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-foreground">
          Focus (optional)
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. customers only" className={input} />
        </label>
      </div>
      <details>
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Paste a thread instead</summary>
        <textarea rows={4} value={pastedThread} onChange={(e) => setPastedThread(e.target.value)} placeholder="Paste the messages here" className={input} />
      </details>
      <button type="submit" disabled={pending || looking} className="px-4 py-2 rounded-lg bg-os-accent text-os-accent-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {pending ? "Starting…" : "Find who needs a reply"}
      </button>
      {looking && <p role="status" className="text-xs text-muted-foreground">Looking for replies…</p>}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </form>
  )
}
