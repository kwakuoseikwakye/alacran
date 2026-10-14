"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DiffView } from "@/components/diff-view"
import { flyToApprovals } from "@/components/os/motion"
import { approveGuideProposalAction, dismissGuideProposalAction } from "@/lib/guide/actions"
import type { GuideChange, GuideChangeGroup, GuideProposal } from "@/lib/guide/proposal"
import { DISMISSED_NOTICE, FAILED_NOTICE, KIND_LABEL, SECTION_TITLE, approveButtonLabel, describeApprove, summarySentence } from "@/lib/guide/proposal-copy"

type Notice = { text: string; tone: "ok" | "info" | "error" }

/** What the card calls to act. Defaults to the real server actions; the preview page swaps in stand-ins that write nothing. */
export type GuideCardActions = {
  approve: (expected: { id: string; baseBodyHash: string }) => ReturnType<typeof approveGuideProposalAction>
  dismiss: (id: string) => ReturnType<typeof dismissGuideProposalAction>
  refresh: () => void
}

function ChangeRow({ change }: { change: GuideChange }) {
  const reworded = change.kind === "reworded" && change.before !== undefined && change.after !== undefined
  const detail = change.after ?? change.before
  return (
    <div className={`guide-row guide-row--${change.kind}`}>
      <span className={`guide-chip guide-chip--${change.kind}`}>{KIND_LABEL[change.kind]}</span>
      <div>
        <b>{change.name}</b>
        {reworded ? (
          <p><s>{change.before}</s><br />{change.after}</p>
        ) : detail ? (
          <p>{detail}</p>
        ) : null}
      </div>
    </div>
  )
}

function Group({ group }: { group: GuideChangeGroup }) {
  return (
    <div className="guide-group">
      <h4>{SECTION_TITLE[group.section]}</h4>
      {group.items.map((change, i) => <ChangeRow key={`${change.kind}-${change.name}-${i}`} change={change} />)}
      {group.more > 0 && <p className="guide-group-more">and {group.more} more</p>}
    </div>
  )
}

/**
 * The "Guide update" approval: what would change in the company's AGENTS.md guide block, in plain language, with the
 * real diff one click away. Only "Update the guide" writes anything. It stays mounted when the proposal goes away so
 * the outcome ("Updated", "Not now") can still be read.
 */
export function GuideProposalCard({ companyId, proposal, actions }: { companyId: string; proposal: GuideProposal | null; actions?: GuideCardActions }) {
  const router = useRouter()
  const act: GuideCardActions = actions ?? {
    approve: (expected) => approveGuideProposalAction(companyId, expected),
    dismiss: (id) => dismissGuideProposalAction(companyId, id),
    refresh: () => router.refresh(),
  }
  const card = useRef<HTMLElement>(null)
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [acting, setActing] = useState<"approve" | "dismiss" | null>(null)

  function approve() {
    if (!proposal) return
    setNotice(null)
    setActing("approve")
    start(async () => {
      try {
        const res = await act.approve({ id: proposal.id, baseBodyHash: proposal.baseBodyHash })
        setActing(null)
        const outcome = describeApprove(res)
        setNotice({ text: outcome.notice, tone: outcome.tone })
        if (outcome.effect === "leave") {
          await flyToApprovals(card.current)
          act.refresh()
        } else if (outcome.effect === "reload") act.refresh()
      } catch {
        setActing(null)
        setNotice({ text: FAILED_NOTICE, tone: "error" })
      }
    })
  }

  function dismiss() {
    if (!proposal) return
    setNotice(null)
    setActing("dismiss")
    start(async () => {
      try {
        const res = await act.dismiss(proposal.id)
        setActing(null)
        if (!res.ok) { setNotice({ text: res.error, tone: "error" }); return }
        setNotice({ text: DISMISSED_NOTICE, tone: "info" })
        act.refresh()
      } catch {
        setActing(null)
        setNotice({ text: FAILED_NOTICE, tone: "error" })
      }
    })
  }

  if (!proposal && !notice) return null
  const { counts } = proposal ?? { counts: null }

  return (
    <section ref={card} aria-labelledby="guide-update-heading" className="guide-update">
      <h2 id="guide-update-heading" className="guide-update-heading">Guide update</h2>
      {notice && <p role="status" className={`guide-update-notice guide-update-notice--${notice.tone}`}>{notice.text}</p>}
      {proposal && counts && (
        <article className="guide-update-card">
          <header className="guide-update-head">
            <div>
              <p className="eyebrow">Ready for your decision</p>
              <h3 className="guide-update-title">Your operating guide is out of date</h3>
            </div>
            <span className="guide-update-risk" title="Only the generated guide block changes.">Low risk</span>
          </header>

          <div className="guide-meter" aria-hidden="true">
            {(["new", "reworded", "removed"] as const).filter((kind) => counts[kind] > 0).map((kind) => (
              <i key={kind} className={`guide-meter-${kind}`} style={{ flex: counts[kind] }} />
            ))}
          </div>
          <p className="guide-update-sum">{summarySentence(counts)}</p>

          {proposal.groups.map((group) => <Group key={group.section} group={group} />)}
          <p className="guide-update-safe">Everything else in AGENTS.md stays exactly as you wrote it.</p>

          <details className="guide-update-tech">
            <summary title="Shows the exact lines that would change in the guide.">Show technical details</summary>
            <div className="guide-update-diff"><DiffView oldText={proposal.oldBody} newText={proposal.newBody} /></div>
          </details>

          <div className="guide-update-actions">
            <Button
              size="sm"
              disabled={pending}
              title="Writes these changes into AGENTS.md and saves them as one change in this company's history. Your own text there is not touched."
              onClick={approve}
            >
              {approveButtonLabel(acting)}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Keeps the guide as it is. Alacrán asks again only when something else changes."
              onClick={dismiss}
            >
              Not now
            </Button>
            <span className="guide-update-note">Saved as its own commit in this company&apos;s history, so it can be undone.</span>
          </div>
        </article>
      )}
    </section>
  )
}
