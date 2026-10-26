import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const approveHeldAction = vi.fn()
const rejectHeldAction = vi.fn()
vi.mock("@/lib/jobs/actions", () => ({ approveHeldAction: (...a: unknown[]) => approveHeldAction(...a), rejectHeldAction: (...a: unknown[]) => rejectHeldAction(...a) }))

import { HeldActionList } from "./held-action-list"
import { heldStatusWords, isOpenHeld } from "@/lib/jobs/held-words"
import type { HeldAction } from "@/lib/jobs/store"

const base = { key: "k", jobId: "invoice-chaser", runId: "r1", detail: "", createdAt: "2026-10-26T09:00:00.000Z", status: "pending" as const }
const mail: HeldAction = {
  ...base,
  id: "1",
  row: "publication",
  title: "Remind Ama about invoice 42",
  detail: "Overdue 30 days",
  mail: { to: "ama@example.com", subject: "Invoice 42 is overdue", body: "Hi Ama,\nInvoice 42 is now 30 days overdue." },
}
const money: HeldAction = { ...base, id: "2", row: "money", title: "Pay the printer £120" }
const access: HeldAction = { ...base, id: "3", row: "credentials", title: "Give Kofi Drive access" }

const NOW = Date.parse("2026-10-26T12:00:00Z")
const html = (items: HeldAction[], extra: object = {}) =>
  renderToStaticMarkup(React.createElement(HeldActionList, { companyId: "acme", items, now: NOW, ...extra })).replace(/&#x27;/g, "'")
const buttons = (h: string) => [...h.matchAll(/<button[^>]*title="([^"]+)"[^>]*>([^<]+)<\/button>/g)].map((m) => ({ title: m[1], text: m[2] }))

describe("HeldActionList", () => {
  it("AC5: shows the gate row in words, the job, date, title, detail and the full mail", () => {
    const h = html([mail, money, access])
    for (const text of ["Sends a message", "Spends money", "Changes access", "From invoice-chaser, 26 Oct", "Remind Ama about invoice 42", "Overdue 30 days", "ama@example.com", "Invoice 42 is overdue", "Hi Ama,\nInvoice 42 is now 30 days overdue."]) {
      expect(h).toContain(text)
    }
  })

  it("AC5: Approve and Reject are written phrases with tooltips, never bare icons", () => {
    const b = buttons(html([mail, money]))
    expect(b.map((x) => x.text)).toEqual(["Approve all…", "Reject all", "Approve and send", "Reject", "Approve", "Reject"])
    for (const x of b) expect(x.title.length).toBeGreaterThan(10)
  })

  it("AC11: approve-all starts as a button that asks first; nothing is sent from a render", () => {
    const h = html([mail, money])
    expect(h).toContain("Approve all…")
    expect(h).not.toContain("Yes, approve all")
    expect(approveHeldAction).not.toHaveBeenCalled()
    expect(rejectHeldAction).not.toHaveBeenCalled()
    // One item: no bulk buttons.
    expect(html([mail])).not.toContain("Approve all")
  })

  it("AC8: a failed send says so once, says the job will offer it again, and can only be cleared, not resent", () => {
    const h = html([{ ...mail, status: "failed", reason: "Not signed in to Outlook. Connect it in Alacrán (Connected tools)." }])
    expect(h).toContain("Didn't send: Not signed in to Outlook. Connect it in Alacrán (Connected tools). If the job still wants to send it, it will offer it again on its next run.")
    expect(h.match(/failed|didn't send/gi)).toHaveLength(1)
    expect(buttons(h).map((x) => x.text)).toEqual(["Clear"])
    expect(buttons(h)[0].title).toBe("Take this off the list. Clearing doesn't send it; the job may offer it again on its next run.")
  })

  it("AC9: an approved money or access step stays as a settled card the owner clears when done", () => {
    const item: HeldAction = { ...money, status: "approved", decidedAt: "2026-10-26T10:00:00Z" }
    const h = html([item])
    expect(h).toContain("Approved 26 Oct. You do this step yourself: Alacrán can't carry it out.")
    const b = buttons(h)
    expect(b.map((x) => x.text)).toEqual(["Done, clear it"])
    expect(b[0].title).toMatch(/stays in the job's history/)
    // It is still open, so the badge (which counts open items) keeps counting it until it is cleared.
    expect(isOpenHeld(item)).toBe(true)
    expect(isOpenHeld({ ...item, clearedAt: "2026-10-27T10:00:00Z" })).toBe(false)
  })

  it("stuck send: Clear appears only once it has been sending longer than the send timeout, and says check Outlook first", () => {
    const fresh: HeldAction = { ...mail, status: "sending", decidedAt: new Date(NOW - 30_000).toISOString() }
    expect(buttons(html([fresh]))).toEqual([])
    const stuck = html([{ ...fresh, decidedAt: new Date(NOW - 61_000).toISOString() }])
    expect(stuck).toContain("Check Outlook's Sent folder first")
    expect(buttons(stuck).map((x) => x.text)).toEqual(["Clear"])
  })

  it("the decision buttons come after the mail they approve", () => {
    const h = html([mail])
    expect(h.indexOf("Invoice 42 is now 30 days overdue")).toBeLessThan(h.indexOf("Approve and send"))
  })

  it("renders nothing when there is nothing to say, and owns the section when there is", () => {
    expect(html([])).toBe("")
    expect(html([mail])).toContain('<h2 id="jobs-need-you">Unattended jobs need you</h2>')
    const flags = React.createElement("p", null, "a flag")
    expect(html([], { children: flags })).toContain("a flag")
  })

  it("AC12: an unreadable queue is said with a next step", () => {
    const h = html([], { unreadable: true })
    expect(h).toContain("can't be read right now")
    expect(h).toContain("Reload the page")
    expect(h).toContain("they'll show up in this section as needing you")
    expect(h).not.toContain("below")
  })

  it("AC9/AC13: history words never claim a step Alacrán can't do was done, and dates are local '26 Oct'", () => {
    expect(heldStatusWords({ ...money, status: "approved", decidedAt: "2026-10-26T10:00:00Z" }, NOW)).toBe("Approved 26 Oct, you do this step yourself")
    expect(heldStatusWords({ ...money, status: "approved", decidedAt: "2026-10-26T10:00:00Z", clearedAt: "2026-10-27T10:00:00Z" }, NOW)).toBe(
      "Approved 26 Oct, you do this step yourself; you marked it done 27 Oct"
    )
    expect(heldStatusWords({ ...mail, status: "sent", sentAt: "2026-10-26T10:00:00Z" }, NOW)).toBe("Sent 26 Oct")
    expect(heldStatusWords({ ...mail, status: "failed", reason: "Not signed in." }, NOW)).toBe("Didn't send: Not signed in.")
    expect(heldStatusWords({ ...mail, status: "rejected", decidedAt: "2026-10-26T10:00:00Z" }, NOW)).toBe("Rejected 26 Oct")
    expect(heldStatusWords({ ...mail, status: "sending", clearedAt: "2026-10-26T10:00:00Z" }, NOW)).toMatch(/check Outlook's Sent folder/)
    // Stuck past the send timeout: history says so too, matching Approvals.
    expect(heldStatusWords({ ...mail, status: "sending", decidedAt: new Date(NOW - 30_000).toISOString() }, NOW)).toBe("Sending…")
    expect(heldStatusWords({ ...mail, status: "sending", decidedAt: new Date(NOW - 61_000).toISOString() }, NOW)).toBe("Stuck while sending: check Outlook's Sent folder")
  })
})
