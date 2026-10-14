import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { CommsInquiry } from "@/lib/comms/inquiries"
import type { ReplyLog } from "@/lib/comms/reply-log"

globalThis.React = React

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound(), useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: vi.fn(async () => [{ id: "test-co", name: "Test", rootPath: "/w/test-co" }]),
}))
vi.mock("@/lib/comms/actions", () => ({ approveInquiry: vi.fn(), discardInquiry: vi.fn(), markReplied: vi.fn() }))
vi.mock("@/lib/company-commands/run-company-command", () => ({ runCompanyCommand: vi.fn() }))
vi.mock("@/lib/company-commands/company-command-status", () => ({ getCompanyCommandStatus: vi.fn() }))
vi.mock("@/lib/company-commands/company-command-result", () => ({ getCompanyCommandResult: vi.fn() }))

const mockList = vi.fn(async (): Promise<CommsInquiry[]> => [])
vi.mock("@/lib/comms/inquiries", () => ({ listInquiries: () => mockList() }))

const emptyLog: ReplyLog = { schema_version: 1, replied_count: 0, records: [] }
const mockLog = vi.fn(async (): Promise<ReplyLog> => emptyLog)
vi.mock("@/lib/comms/reply-log", () => ({ readReplyLog: () => mockLog() }))

vi.mock("@/lib/os/comms/read", () => ({
  readComms: vi.fn(async () => [
    { id: "messages:2026-09-27.md", source: "messages", date: "2026-09-27", title: "2026-09-27", path: "notes/company/messages/2026-09-27.md" },
  ]),
}))
const mockConnectors = vi.fn(async (declared: { id: string; label: string }[]) =>
  declared.map((c) => ({ ...c, status: c.id === "beeper" ? "connected" : "not_configured" }))
)
vi.mock("@/lib/os/departments/connectors", () => ({
  resolveDepartmentConnectors: (d: { id: string; label: string }[]) => mockConnectors(d),
}))

const { default: CommsPage } = await import("./page")

const inq = (over: Partial<CommsInquiry>): CommsInquiry => ({
  id: "i", date: "2026-09-28", from: "Someone", channel: "email", subject: "s", receivedAt: "2026-09-27",
  urgency: "medium", category: "question", status: "pending", injectionFlag: false,
  asked: "", context: "", draftReply: "Hi.", fileName: "x.md", ...over,
})

const render = async () => renderToStaticMarkup(await CommsPage({ params: Promise.resolve({ companyId: "test-co" }) }))

describe("CommsPage", () => {
  beforeEach(() => vi.clearAllMocks())

  it("404s for an unknown company", async () => {
    await expect(CommsPage({ params: Promise.resolve({ companyId: "nope" }) })).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("renders the five sections and connectors", async () => {
    const out = await render()
    for (const text of ["Connected tools", "Find who needs a reply", "Waiting for you", "Ready to reply", "What Alacrán remembers", "Beeper", "WhatsApp", "Slack", "Notion", "Email"]) {
      expect(out).toContain(text)
    }
    expect(out).toContain("records/comms/inquiries.yaml")
    expect(out).toContain("notes/company/messages/2026-09-27.md")
  })

  it("splits pending and approved cards and hides replied ones from the queues", async () => {
    mockList.mockResolvedValueOnce([
      inq({ from: "Pending Pat", status: "pending", fileName: "a.md" }),
      inq({ from: "Approved Ali", status: "approved", fileName: "b.md" }),
      inq({ from: "Replied Rae", status: "replied", fileName: "c.md" }),
    ])
    const out = await render()
    expect(out).toMatch(/Waiting for you\s*(<!-- -->)?\s*\(1\)/)
    expect(out).toMatch(/Ready to reply\s*(<!-- -->)?\s*\(1\)/)
    expect(out).toContain("Pending Pat")
    expect(out).toContain("Approved Ali")
    expect(out).not.toContain("Replied Rae")
  })

  it("lists the reply log, newest first, capped at 10", async () => {
    const records = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`, from: `Person ${i}`, channel: "email", subject: `Subject ${i}`,
      replied_at: `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`,
    }))
    mockLog.mockResolvedValueOnce({ schema_version: 1, replied_count: 12, records })
    const out = await render()
    expect(out).toContain("12")
    expect(out).toContain("replies logged")
    expect(out).toContain("Person 11")
    expect(out).not.toContain("Person 1<")
    expect(out.indexOf("Person 11")).toBeLessThan(out.indexOf("Person 10"))
  })

  it("still renders when the reply log is corrupt", async () => {
    mockLog.mockRejectedValueOnce(new Error("records/comms/inquiries.yaml isn't a reply log Alacrán can read."))
    const out = await render()
    expect(out).toContain("a reply log Alacrán can read")
    expect(out).toContain("Waiting for you")
  })
})
