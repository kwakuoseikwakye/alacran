"use client"

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { approveHeldAction, rejectHeldAction } from "@/lib/jobs/actions"
import { bulkSummary, isStuckSending, rowWords, shortDate } from "@/lib/jobs/held-words"
import type { HeldAction } from "@/lib/jobs/store"

type Notice = { ok: boolean; message: string; note?: string } | null

/**
 * The "Unattended jobs need you" section of Approvals (v248): steps jobs held for the owner's OK,
 * then the job flags passed in as `children`. It stays mounted when the queue empties, so the
 * result of the owner's last decision is still said after the list refreshes. Approving a held
 * mail sends exactly what is shown; approving anything else records it and the owner does it.
 */
export function HeldActionList({
  companyId,
  items,
  unreadable = false,
  now,
  children,
}: {
  companyId: string
  items: HeldAction[]
  unreadable?: boolean
  /** The server's clock at render, so a send stuck past its timeout can be cleared. */
  now: number
  children?: ReactNode
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const decidable = items.filter((i) => i.status === "pending")
  const busy = pending || confirmAll

  useEffect(() => {
    if (notice) statusRef.current?.focus()
  }, [notice])
  useEffect(() => {
    if (confirmAll) confirmRef.current?.focus()
  }, [confirmAll])

  const act = (fn: () => Promise<{ ok: boolean; message: string; note?: string }>) =>
    start(async () => {
      setNotice(null)
      setNotice(await fn().catch(() => ({ ok: false, message: "That didn't work. Try again." })))
      setConfirmAll(false)
      router.refresh()
    })
  const clear = (item: HeldAction) => act(() => rejectHeldAction(companyId, [item.id]))

  if (!items.length && !unreadable && !notice && !children) return null

  return (
    <section aria-labelledby="jobs-need-you">
      <h2 id="jobs-need-you">Unattended jobs need you</h2>
      <div className="space-y-3">
        {unreadable && (
          <p className="text-sm text-os-err">
            The list of held steps can&apos;t be read right now, so some may be missing. Reload the page in a minute. If this stays, jobs can&apos;t hold new
            steps either: they&apos;ll show up below as needing you, with details on the Jobs page.
          </p>
        )}
        {decidable.length > 1 &&
          (confirmAll ? (
            <div className="space-y-2">
              <p className="text-sm text-os-warn">{bulkSummary(decidable)}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  ref={confirmRef}
                  size="sm"
                  disabled={pending}
                  title="Send every message listed here, exactly as shown, and record the other approvals."
                  onClick={() => act(() => approveHeldAction(companyId, decidable.map((i) => i.id)))}
                >
                  Yes, approve all
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmAll(false)} title="Don't approve them now">
                  Not now
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                title="See what approving everything listed here would send, then confirm."
                onClick={() => {
                  setNotice(null)
                  setConfirmAll(true)
                }}
              >
                Approve all…
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} title="Turn down every step listed here. Nothing is sent." onClick={() => act(() => rejectHeldAction(companyId, decidable.map((i) => i.id)))}>
                Reject all
              </Button>
            </div>
          ))}
        {notice && (
          <p ref={statusRef} tabIndex={-1} role="status" className="text-sm outline-none">
            <span className={notice.ok ? "text-os-ok" : "text-os-err"}>{notice.message}</span>
            {notice.note && <span className="text-os-text"> {notice.note}</span>}
          </p>
        )}
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border border-os-border bg-os-surface p-3 space-y-2 text-sm">
                <div className="min-w-0 break-words">
                  <p className="text-xs font-medium uppercase tracking-wide text-os-muted">{rowWords(item)}</p>
                  <p className="font-semibold text-os-text">{item.title}</p>
                  {item.detail && <p className="text-os-text whitespace-pre-wrap">{item.detail}</p>}
                  <p className="text-os-dim">
                    From {item.jobId}, {shortDate(item.createdAt)}
                  </p>
                </div>
                {item.mail && (
                  <dl className="rounded border border-os-border bg-os-bg p-2 space-y-1">
                    <div>
                      <dt className="inline text-os-muted">To: </dt>
                      <dd className="inline text-os-text [overflow-wrap:anywhere]">{item.mail.to}</dd>
                    </div>
                    <div>
                      <dt className="inline text-os-muted">Subject: </dt>
                      <dd className="inline text-os-text [overflow-wrap:anywhere]">{item.mail.subject}</dd>
                    </div>
                    <div>
                      <dt className="sr-only">Message</dt>
                      <dd className="whitespace-pre-wrap break-words text-os-text">{item.mail.body}</dd>
                    </div>
                  </dl>
                )}
                {item.status === "sending" &&
                  (isStuckSending(item, now) ? (
                    <p className="text-os-warn">Sending is taking longer than it should. Check Outlook&apos;s Sent folder first: if the message is there, it went.</p>
                  ) : (
                    <p className="text-os-warn">Sending… If this stays, check Outlook&apos;s Sent folder before doing anything.</p>
                  ))}
                {item.status === "failed" && (
                  <p className="text-os-err">
                    Didn&apos;t send: {item.reason} If the job still wants to send it, it will offer it again on its next run.
                  </p>
                )}
                {item.status === "approved" && (
                  <p className="text-os-text">Approved {shortDate(item.decidedAt)}. You do this step yourself: Alacrán can&apos;t carry it out.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {item.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        disabled={busy}
                        title={item.mail ? "Send this exact message now through Outlook." : "Record your yes. Alacrán can't do this step itself: you do it."}
                        onClick={() => act(() => approveHeldAction(companyId, [item.id]))}
                      >
                        {item.mail ? "Approve and send" : "Approve"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} title="Turn this down. Nothing is sent or done." onClick={() => act(() => rejectHeldAction(companyId, [item.id]))}>
                        Reject
                      </Button>
                    </>
                  )}
                  {item.status === "approved" && (
                    <Button size="sm" variant="outline" disabled={busy} title="You've done this step. Take it off Approvals; it stays in the job's history." onClick={() => clear(item)}>
                      Done, clear it
                    </Button>
                  )}
                  {(item.status === "failed" || isStuckSending(item, now)) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      title={
                        item.status === "failed"
                          ? "Take this off the list. It stays in the job's history, and it isn't sent again."
                          : "Take this off the list after checking Outlook's Sent folder. Nothing is sent or stopped."
                      }
                      onClick={() => clear(item)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </section>
  )
}
