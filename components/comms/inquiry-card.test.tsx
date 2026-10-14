import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { CommsInquiry } from "@/lib/comms/inquiries"

globalThis.React = React

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/comms/actions", () => ({
  approveInquiry: vi.fn(),
  discardInquiry: vi.fn(),
  markReplied: vi.fn(),
}))

const { InquiryCard } = await import("./inquiry-card")

const base: CommsInquiry = {
  id: "inq-1",
  date: "2026-09-28",
  from: "Ama <script>alert(1)</script>",
  channel: "whatsapp",
  subject: "Invoice timing",
  receivedAt: "2026-09-27",
  urgency: "high",
  category: "question",
  status: "pending",
  threadHint: "WhatsApp chat 'Ama', 27 Sep",
  injectionFlag: false,
  asked: "Ama said on 27 Sep she has no invoice.",
  context: "- records/finances/transactions.yaml",
  draftReply: "Hi Ama — this week.",
  fileName: "2026-09-28-ama.md",
}

const html = (i: Partial<CommsInquiry>) =>
  renderToStaticMarkup(<InquiryCard inquiry={{ ...base, ...i }} companyId="test-co" />)

describe("InquiryCard", () => {
  it("shows approve/discard for pending cards", () => {
    const out = html({})
    expect(out).toContain(">Approve<")
    expect(out).toContain(">Discard<")
    expect(out).not.toContain("Mark replied")
    expect(out).toContain("Hi Ama — this week.")
  })

  it("shows copy and mark replied for approved cards", () => {
    const out = html({ status: "approved" })
    expect(out).toContain("Copy draft")
    expect(out).toContain("Mark replied")
    expect(out).toContain("WhatsApp chat")
    expect(out).not.toContain(">Approve<")
  })

  it("warns when the source tried to instruct Alacrán", () => {
    expect(html({ injectionFlag: true })).toContain("tried to give Alacrán instructions")
  })

  it("escapes sender text", () => {
    expect(html({})).not.toContain("<script>")
  })
})
