"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"

const POLL_INTERVAL_MS = 3000

export function MakePostsForm({ agentId }: { agentId: string }) {
  const router = useRouter()
  const [topic, setTopic] = useState("")
  const [count, setCount] = useState("3")
  const [when, setWhen] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)

  // Same loop as CompanyCommandRunner: started from the submit handler, not an
  // effect, so Strict Mode can't start it twice.
  async function pollUntilDone() {
    try {
      if ((await getCompanyCommandStatus(agentId)).running) {
        setTimeout(pollUntilDone, POLL_INTERVAL_MS)
        return
      }
      const outcome = await getCompanyCommandResult("make-posts", agentId)
      // A run that wrote nothing (AI signed out, out of usage) says why here.
      setMessage(outcome.changed ? null : outcome.message)
    } catch {
      setMessage("Couldn't check on your posts. Reload the page to see them.")
    }
    setDrafting(false)
    router.refresh()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim() || pending) return
    setPending(true)
    setMessage(null)
    try {
      const r = await runCompanyCommand("make-posts", { topic, count, when }, agentId)
      setMessage(r.started ? null : r.message)
      if (r.started) {
        setTopic("")
        setDrafting(true)
        setTimeout(pollUntilDone, POLL_INTERVAL_MS)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't start. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="post-form">
      <label>What about?<textarea required value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. our new weekend brunch menu" /></label>
      <div className="post-form-row">
        <label>How many?<select value={count} onChange={(e) => setCount(e.target.value)}>{["1", "2", "3", "4", "5"].map((n) => <option key={n}>{n}</option>)}</select></label>
        <label>For<input value="Instagram" disabled /></label>
        <label>When? (optional)<input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="e.g. next week" /></label>
      </div>
      <button type="submit" disabled={pending || drafting || !topic.trim()}>{pending ? "Starting…" : "Make posts"}</button>
      {drafting && <p role="status">Alacrán is drafting your posts…</p>}
      {message && <p role="status">{message}</p>}
    </form>
  )
}
