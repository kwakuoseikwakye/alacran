import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const approveHeldAction = vi.fn()
const rejectHeldAction = vi.fn()
vi.mock("@/lib/jobs/actions", () => ({ approveHeldAction: (...a: unknown[]) => approveHeldAction(...a), rejectHeldAction: (...a: unknown[]) => rejectHeldAction(...a) }))

import { HeldActionList, heldStatusWords } from "./held-action-list"
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

const html = (items: HeldAction[]) => renderToStaticMarkup(React.createElement(HeldActionList, { companyId: "acme", items })).replace(/&#x27;/g, "'")
const buttons = (h: string) => [...h.matchAll(/<button[^>]*title="([^"]+)"[^>]*>([^<]+)<\/button>/g)].map((m) => ({ title: m[1], text: m[2] }))

describe("HeldActionList", () => {
  it("AC5: shows the gate row in words, the job, date, title, detail and the full mail", () => {
    const h = html([mail, money, access])
    for (const text of ["Sends a message", "Spends money", "Changes access", "From invoice-chaser, 2026-10-26", "Remind Ama about invoice 42", "Overdue 30 days", "ama@example.com", "Invoice 42 is overdue", "Hi Ama,\nInvoice 42 is now 30 days overdue."]) {
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

  it("AC8: a failed send says so with its reason and can only be cleared, not resent", () => {
    const h = html([{ ...mail, status: "failed", reason: "Sending failed: Not signed in" }])
    expect(h).toContain("Didn't send. Sending failed: Not signed in")
    expect(buttons(h).map((x) => x.text)).toEqual(["Clear"])
  })

  it("AC9/AC13: history words never claim a step Alacrán can't do was done", () => {
    expect(heldStatusWords({ ...money, status: "approved", decidedAt: "2026-10-26T10:00:00Z" })).toBe("Approved 2026-10-26, you do this step yourself")
    expect(heldStatusWords({ ...mail, status: "sent", sentAt: "2026-10-26T10:00:00Z" })).toBe("Sent 2026-10-26")
    expect(heldStatusWords({ ...mail, status: "failed", reason: "Sending failed: x" })).toBe("Failed: Sending failed: x")
    expect(heldStatusWords({ ...mail, status: "rejected", decidedAt: "2026-10-26T10:00:00Z" })).toBe("Rejected 2026-10-26")
  })
})
