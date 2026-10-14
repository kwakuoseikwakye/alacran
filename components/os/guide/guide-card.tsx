"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button, buttonVariants } from "@/components/ui/button"
import { addGuideAction, reopenGuideProposalAction } from "@/lib/guide/actions"
import type { GuideChangeCounts } from "@/lib/guide/proposal"
import { reviewLabel } from "@/lib/guide/proposal-copy"
import type { GuideState } from "@/lib/guide/refresh"
import { cn } from "@/lib/utils"

const COPY = {
  "not-added": {
    title: "Add the operating guide",
    body: "Adds a short \"How this company works\" section to this company's AGENTS.md so every AI you use knows your departments, installed teams and commands, and when to run checks and offer a handoff. Your own text in AGENTS.md is never changed.",
  },
  "up-to-date": { title: "Operating guide is up to date", body: "Department and team changes you make here keep it current automatically." },
  stale: { title: "Operating guide is out of date", body: "Something changed outside the app. See what would change before your AIs read it." },
  "needs-attention": { title: "Operating guide needs your attention", body: "" },
} as const

const DISMISSED_BODY = "You chose Not now for these changes. Nothing is written until you review them."
const UNSURE = "Couldn't confirm the result. Pressing the button again is safe."

/**
 * The Skills page's guide card. It never rewrites the guide: an out-of-date guide is reviewed in Approvals, where
 * the change is shown first. `counts` and `dismissed` describe the live proposal (see observeGuide).
 */
export function GuideCard({
  companyId,
  state,
  counts = null,
  dismissed = false,
}: {
  companyId: string
  state: GuideState
  counts?: GuideChangeCounts | null
  dismissed?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const copy = COPY[state.state]
  const tasksHref = `/c/${companyId}/tasks`

  function add() {
    setError(null)
    start(async () => {
      try {
        const res = await addGuideAction(companyId)
        if (!res.ok) { setError(res.error); router.refresh(); return }
        if (!res.committed && res.commitError) setError(res.commitError)
        router.refresh()
      } catch {
        setError(UNSURE)
      }
    })
  }

  function reopen() {
    setError(null)
    start(async () => {
      try {
        const res = await reopenGuideProposalAction(companyId)
        if (!res.ok) { setError(res.error); return }
        router.push(tasksHref)
      } catch {
        setError(UNSURE)
      }
    })
  }

  const body = state.state === "needs-attention" ? state.detail : state.state === "stale" && dismissed ? DISMISSED_BODY : copy.body

  return (
    <section aria-labelledby="guide-title" className="space-y-2 rounded-xl border border-os-border bg-os-surface p-5">
      <h2 id="guide-title" className="text-lg font-semibold">{copy.title}</h2>
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{body}</p>
      {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {state.state === "not-added" && (
          <Button disabled={pending} title="Adds a short section to your company's working agreement so every AI knows how your company works." onClick={add}>
            {pending ? "Adding…" : "Add the operating guide"}
          </Button>
        )}
        {state.state === "stale" && !dismissed && (
          <Link href={tasksHref} data-variant="default" className={cn(buttonVariants())} title="Opens the change list in Approvals. Nothing is written until you approve it.">
            {counts ? reviewLabel(counts) : "Review changes"}
          </Link>
        )}
        {state.state === "stale" && dismissed && (
          <Button variant="outline" disabled={pending} title="Brings the change list back in Approvals. Nothing is written until you approve it." onClick={reopen}>
            {pending ? "Opening…" : "Review changes again"}
          </Button>
        )}
        <Link
          href={`/c/${companyId}/preview/guide-update`}
          className={cn(buttonVariants({ variant: "ghost" }))}
          title="Opens a sample guide update with made-up changes. Nothing is saved."
        >
          See what a guide update looks like
        </Link>
      </div>
    </section>
  )
}
