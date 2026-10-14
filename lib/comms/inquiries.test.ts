import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { parseInquiry, listInquiries, isSafeInquiryFileName, updateFrontmatterStatus } from "./inquiries"

const CARD = `---
id: "inq-2026-09-28-ama-invoice"
date: "2026-09-28"
from: "Ama Mensah"
channel: "whatsapp"
subject: "Asked when the September invoice will arrive"
received_at: "2026-09-27"
urgency: "high"
category: "question"
status: "pending"
thread_hint: "WhatsApp chat 'Ama Mensah', 27 Sep"
source_note: "notes/company/messages/2026-09-27.md"
---
### What they asked
Ama said on 27 Sep (WhatsApp) she hasn't received the invoice.

### Context used
- records/finances/transactions.yaml

### Draft reply
Hi Ama — it goes out this week.`

function card(fm: Record<string, string>): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: "${v}"`)
  return `---\n${lines.join("\n")}\n---\n### Draft reply\nHi.`
}

describe("parseInquiry", () => {
  it("parses a full card", () => {
    const inq = parseInquiry(CARD, "2026-09-28-ama-invoice.md")!
    expect(inq.id).toBe("inq-2026-09-28-ama-invoice")
    expect(inq.from).toBe("Ama Mensah")
    expect(inq.channel).toBe("whatsapp")
    expect(inq.receivedAt).toBe("2026-09-27")
    expect(inq.urgency).toBe("high")
    expect(inq.category).toBe("question")
    expect(inq.status).toBe("pending")
    expect(inq.threadHint).toContain("Ama Mensah")
    expect(inq.sourceNote).toBe("notes/company/messages/2026-09-27.md")
    expect(inq.injectionFlag).toBe(false)
    expect(inq.asked).toContain("Ama said on 27 Sep")
    expect(inq.context).toContain("transactions.yaml")
    expect(inq.draftReply).toBe("Hi Ama — it goes out this week.")
    expect(inq.fileName).toBe("2026-09-28-ama-invoice.md")
  })

  it("falls back to safe defaults for missing or unknown values", () => {
    const inq = parseInquiry(card({ urgency: "URGENT!!", category: "spam", status: "weird" }), "x.md")!
    expect(inq.id).toBe("x")
    expect(inq.from).toBe("Unknown sender")
    expect(inq.channel).toBe("other")
    expect(inq.urgency).toBe("medium")
    expect(inq.category).toBe("other")
    expect(inq.status).toBe("pending")
  })

  it("reads injection_flag as boolean or string", () => {
    expect(parseInquiry(`---\ninjection_flag: true\n---\nx`, "a.md")!.injectionFlag).toBe(true)
    expect(parseInquiry(`---\ninjection_flag: "true"\n---\nx`, "a.md")!.injectionFlag).toBe(true)
  })

  it("returns null without frontmatter or with broken YAML", () => {
    expect(parseInquiry("just text", "a.md")).toBeNull()
    expect(parseInquiry("---\nfrom: [unclosed\n---\nx", "a.md")).toBeNull()
  })
})

describe("file name and status helpers", () => {
  it("rejects unsafe names", () => {
    expect(isSafeInquiryFileName("2026-09-28-ama.md")).toBe(true)
    for (const bad of ["../x.md", "a/b.md", "x.txt", "", "..md"]) expect(isSafeInquiryFileName(bad)).toBe(false)
  })

  it("rewrites status to a comms-only value", () => {
    expect(updateFrontmatterStatus(CARD, "replied")).toContain(`status: "replied"`)
  })
})

describe("listInquiries", () => {
  let root: string
  const dir = () => path.join(root, "notes", "comms", "inquiries")

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "alacran-inquiries-"))
  })
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("returns [] when the folder is missing", async () => {
    expect(await listInquiries(root)).toEqual([])
  })

  it("sorts by urgency then newest, skipping bad files", async () => {
    await fs.mkdir(dir(), { recursive: true })
    await fs.writeFile(path.join(dir(), "a.md"), card({ from: "Low", urgency: "low", received_at: "2026-09-28" }))
    await fs.writeFile(path.join(dir(), "b.md"), card({ from: "HighOld", urgency: "high", received_at: "2026-09-20" }))
    await fs.writeFile(path.join(dir(), "c.md"), card({ from: "HighNew", urgency: "high", received_at: "2026-09-27" }))
    await fs.writeFile(path.join(dir(), "broken.md"), "---\nfrom: [unclosed\n---\n")
    await fs.writeFile(path.join(dir(), "notes.txt"), card({ from: "Ignored" }))
    const list = await listInquiries(root)
    expect(list.map((i) => i.from)).toEqual(["HighNew", "HighOld", "Low"])
  })
})
