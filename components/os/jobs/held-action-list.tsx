"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { approveHeldAction, rejectHeldAction } from "@/lib/jobs/actions"
import { bulkSummary, rowWords } from "@/lib/jobs/held-words"
import type { HeldAction } from "@/lib/jobs/store"

type Notice = { ok: boolean; message: string } | null

/**
 * Steps unattended jobs held for the owner's OK (v248), in Approvals. Approving a held mail sends
 * exactly what is shown here; approving anything else records the decision and the owner does it.
 */
export function HeldActionList({ companyId, items }: { companyId: string; items: HeldAction[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const decidable = items.filter((i) => i.status === "pending")

  const act = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      setNotice(null)
      setNotice(await fn().catch(() => ({ ok: false, message: "That didn't work. Try again." })))
      setConfirmAll(false)
      router.refresh()
    })

  return (
    <div className="space-y-3">
      {decidable.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {confirmAll ? (
            <>
              <p className="text-sm text-os-warn">{bulkSummary(decidable)}</p>
              <Button size="sm" disabled={pending} title="Send every message listed here, exactly as shown, and record the other approvals." onClick={() => act(() => approveHeldAction(companyId, decidable.map((i) => i.id)))}>
                Yes, approve all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmAll(false)} title="Don't approve them now">
                Not now
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={pending} title="See what approving everything listed here would send, then confirm." onClick={() => setConfirmAll(true)}>
                Approve all…
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} title="Turn down every step listed here. Nothing is sent." onClick={() => act(() => rejectHeldAction(companyId, decidable.map((i) => i.id)))}>
                Reject all
              </Button>
            </>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className={`text-sm ${notice.ok ? "text-os-ok" : "text-os-err"}`}>
          {notice.message}
        </p>
      )}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-os-border bg-os-surface p-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-os-muted">{rowWords(item)}</p>
                <p className="font-semibold text-os-text">{item.title}</p>
                {item.detail && <p className="text-os-text whitespace-pre-wrap">{item.detail}</p>}
                <p className="text-os-dim">
                  From {item.jobId}, {item.createdAt.slice(0, 10)}
                </p>
              </div>
              {item.status === "pending" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    title={item.mail ? "Send this exact message now through Outlook." : "Record your yes. Alacrán can't do this step itself: you do it."}
                    onClick={() => act(() => approveHeldAction(companyId, [item.id]))}
                  >
                    {item.mail ? "Approve and send" : "Approve"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} title="Turn this down. Nothing is sent or done." onClick={() => act(() => rejectHeldAction(companyId, [item.id]))}>
                    Reject
                  </Button>
                </div>
              )}
              {item.status === "failed" && (
                <Button size="sm" variant="outline" disabled={pending} title="Take this off the list. It stays in the job's history, and it isn't sent again." onClick={() => act(() => rejectHeldAction(companyId, [item.id]))}>
                  Clear
                </Button>
              )}
            </div>
            {item.mail && (
              <dl className="rounded border border-os-border bg-os-bg p-2 space-y-1">
                <div>
                  <dt className="inline text-os-muted">To: </dt>
                  <dd className="inline text-os-text break-all">{item.mail.to}</dd>
                </div>
                <div>
                  <dt className="inline text-os-muted">Subject: </dt>
                  <dd className="inline text-os-text">{item.mail.subject}</dd>
                </div>
                <div>
                  <dt className="sr-only">Message</dt>
                  <dd className="whitespace-pre-wrap text-os-text">{item.mail.body}</dd>
                </div>
              </dl>
            )}
            {item.status === "sending" && <p className="text-os-warn">Sending… If this stays, check Outlook&apos;s Sent folder before doing anything.</p>}
            {item.status === "failed" && <p className="text-os-err">Didn&apos;t send. {item.reason}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One line per decided held step, for the job's history on the Jobs page. Never claims a step Alacrán can't do was done. */
export function heldStatusWords(item: HeldAction): string {
  const day = (iso?: string) => (iso ? iso.slice(0, 10) : "")
  switch (item.status) {
    case "pending":
      return "Waiting in Approvals"
    case "sending":
      return "Sending…"
    case "sent":
      return `Sent ${day(item.sentAt)}`
    case "failed":
      return `Failed: ${item.reason ?? "unknown reason"}`
    case "approved":
      return `Approved ${day(item.decidedAt)}, you do this step yourself`
    case "rejected":
      return `Rejected ${day(item.decidedAt)}`
  }
}
