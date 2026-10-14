"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { getCompanyCommandStatus } from "@/lib/company-commands/company-command-status"
import { getCompanyCommandResult } from "@/lib/company-commands/company-command-result"

const POLL_INTERVAL_MS = 3000

export function ResearchProspectsForm({ agentId }: { agentId: string }) {
  const router = useRouter()
  const [target, setTarget] = useState("")
  const [count, setCount] = useState("3")
  const [criteria, setCriteria] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [researching, setResearching] = useState(false)

  // Started from submit, not an effect, so Strict Mode can't start it twice (same as MakePostsForm).
  async function pollUntilDone() {
    try {
      if ((await getCompanyCommandStatus(agentId)).running) {
        setTimeout(pollUntilDone, POLL_INTERVAL_MS)
        return
      }
      const outcome = await getCompanyCommandResult("research-prospects", agentId)
      setError(outcome.changed ? null : outcome.message)
    } catch {
      setError("Couldn't check on the research. Reload the page to see new prospects.")
    }
    setResearching(false)
    router.refresh()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target.trim() || loading || researching) return

    setLoading(true)
    setError(null)

    try {
      const r = await runCompanyCommand("research-prospects", { target, count, criteria }, agentId)
      if (!r.started) throw new Error(r.message)
      setTarget("")
      setCriteria("")
      setResearching(true)
      setTimeout(pollUntilDone, POLL_INTERVAL_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div>
        <label htmlFor="target-query" className="block text-xs font-medium text-foreground">
          Who are you looking for? <span className="text-os-accent">*</span>
        </label>
        <textarea
          id="target-query"
          required
          rows={2}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="e.g. B2B SaaS founders using Next.js, or company domains like acme.com, linear.app"
          className="mt-1 block w-full rounded-lg border border-os-border bg-os-surface px-3 py-2 text-sm text-foreground focus:border-os-accent focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="prospect-count" className="block text-xs font-medium text-foreground">
            How many prospects? (1–5)
          </label>
          <input
            id="prospect-count"
            type="number"
            min={1}
            max={5}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-os-border bg-os-surface px-3 py-2 text-sm text-foreground focus:border-os-accent focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="criteria-focus" className="block text-xs font-medium text-foreground">
            Angle or focus (optional)
          </label>
          <input
            id="criteria-focus"
            type="text"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="e.g. Focus on VP Eng"
            className="mt-1 block w-full rounded-lg border border-os-border bg-os-surface px-3 py-2 text-sm text-foreground focus:border-os-accent focus:outline-none"
          />
        </div>
      </div>

      {researching && <p role="status" className="text-xs text-muted-foreground">Alacrán is researching prospects…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading || researching || !target.trim()}
        className="px-4 py-2 rounded-lg bg-os-accent text-os-accent-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Starting research..." : "Find prospects"}
      </button>
    </form>
  )
}
