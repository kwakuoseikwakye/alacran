"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type { GuideProposal } from "@/lib/guide/proposal"
import { GuideProposalCard } from "./guide-proposal-card"
import type { GuideCardActions } from "./guide-proposal-card"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Stand-ins for the card's server actions. They answer the way the real ones do on success and write nothing, so
 * the preview can be pressed freely. `onGone` stands in for the page refresh that makes a settled proposal vanish.
 */
export function previewActions(onGone: () => void): GuideCardActions {
  return {
    // A short beat, so "Updating…" can be seen.
    approve: async () => {
      await wait(700)
      return { ok: true, changed: true, committed: true }
    },
    dismiss: async () => ({ ok: true }),
    refresh: onGone,
  }
}

/** The real Guide update card, fed sample content and stand-in actions. Nothing here is saved. */
export function GuideProposalPreview({ proposal }: { proposal: GuideProposal }) {
  const [gone, setGone] = useState(false)
  const [round, setRound] = useState(0)
  const actions = useMemo(() => previewActions(() => setGone(true)), [])
  return (
    <>
      <p role="note" className="guide-preview-note">Preview with sample content. Nothing here is saved.</p>
      <GuideProposalCard key={round} companyId="preview" proposal={gone ? null : proposal} actions={actions} />
      <Button
        size="sm"
        variant="outline"
        title="Brings the sample card back so you can try the buttons again."
        onClick={() => {
          setGone(false)
          setRound((n) => n + 1)
        }}
      >
        Show the card again
      </Button>
    </>
  )
}
