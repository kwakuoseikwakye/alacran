import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import yaml from "yaml"
import { markRepliedImpl } from "./mark-replied-impl"
import { readReplyLog } from "./reply-log"

const CARD = `---
id: "inq-1"
from: "Ama Mensah"
channel: "whatsapp"
subject: "Invoice: \\"September\\" — when?"
status: "approved"
---
### Draft reply
Hi Ama.`

describe("markRepliedImpl", () => {
  let root: string
  const cardPath = () => path.join(root, "notes", "comms", "inquiries", "2026-09-28-ama.md")
  const logPath = () => path.join(root, "records", "comms", "inquiries.yaml")
  const now = () => new Date("2026-09-28T10:15:00Z")

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "alacran-replied-"))
    await fs.mkdir(path.dirname(cardPath()), { recursive: true })
    await fs.writeFile(cardPath(), CARD)
  })
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("marks the card replied, creates the log, and commits both files once", async () => {
    const commit = vi.fn(async (_o: { rootPath: string; filePaths: string[]; commitMessage: string }) => {})
    const res = await markRepliedImpl({ companyRoot: root, fileName: "2026-09-28-ama.md", now, gitCommitFile: commit })
    expect(res.ok).toBe(true)
    expect(await fs.readFile(cardPath(), "utf-8")).toContain(`status: "replied"`)
    const log = yaml.parse(await fs.readFile(logPath(), "utf-8"))
    expect(log.replied_count).toBe(1)
    expect(log.records[0]).toEqual({
      id: "inq-1",
      from: "Ama Mensah",
      channel: "whatsapp",
      subject: `Invoice: "September" — when?`,
      replied_at: "2026-09-28T10:15:00.000Z",
    })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0][0].filePaths).toEqual([
      path.join("notes/comms/inquiries", "2026-09-28-ama.md"),
      "records/comms/inquiries.yaml",
    ])
  })

  it("is idempotent: a second call adds nothing and does not commit", async () => {
    const commit = vi.fn(async (_o: { rootPath: string; filePaths: string[]; commitMessage: string }) => {})
    await markRepliedImpl({ companyRoot: root, fileName: "2026-09-28-ama.md", now, gitCommitFile: commit })
    const res = await markRepliedImpl({ companyRoot: root, fileName: "2026-09-28-ama.md", now, gitCommitFile: commit })
    expect(res.ok).toBe(true)
    expect(commit).toHaveBeenCalledTimes(1)
    expect((await readReplyLog(root)).records).toHaveLength(1)
  })

  it.each(["records: nope", "records: [unclosed", "- just\n- a list"])(
    "refuses and overwrites nothing when the log is corrupt (%s)",
    async (corrupt) => {
      await fs.mkdir(path.dirname(logPath()), { recursive: true })
      await fs.writeFile(logPath(), corrupt)
      const commit = vi.fn(async (_o: { rootPath: string; filePaths: string[]; commitMessage: string }) => {})
      const res = await markRepliedImpl({ companyRoot: root, fileName: "2026-09-28-ama.md", now, gitCommitFile: commit })
      expect(res.ok).toBe(false)
      expect(res.message).toContain("records/comms/inquiries.yaml")
      expect(await fs.readFile(logPath(), "utf-8")).toBe(corrupt)
      expect(await fs.readFile(cardPath(), "utf-8")).toBe(CARD)
      expect(commit).not.toHaveBeenCalled()
    }
  )

  it.each(["../records/comms/inquiries.yaml", "a/b.md", "x.txt", ""])("rejects unsafe file name %s", async (name) => {
    const res = await markRepliedImpl({ companyRoot: root, fileName: name, now })
    expect(res.ok).toBe(false)
  })

  it("fails cleanly when the card is missing", async () => {
    const res = await markRepliedImpl({ companyRoot: root, fileName: "nope.md", now })
    expect(res).toEqual({ ok: false, message: "Inquiry not found: nope.md" })
  })

  it("treats an empty log file as an empty log", async () => {
    await fs.mkdir(path.dirname(logPath()), { recursive: true })
    await fs.writeFile(logPath(), "")
    expect(await readReplyLog(root)).toEqual({ schema_version: 1, replied_count: 0, records: [] })
  })

  it("serializes concurrent calls for different cards", async () => {
    const cardAPath = () => path.join(root, "notes", "comms", "inquiries", "2026-09-28-ama.md")
    const cardBPath = () => path.join(root, "notes", "comms", "inquiries", "2026-09-28-kwaku.md")
    const cardA = `---
id: "inq-a"
from: "Ama"
channel: "whatsapp"
subject: "Question A"
status: "approved"
---
### Draft reply
Hi Ama.`
    const cardB = `---
id: "inq-b"
from: "Kwaku"
channel: "email"
subject: "Question B"
status: "approved"
---
### Draft reply
Hi Kwaku.`
    await fs.writeFile(cardAPath(), cardA)
    await fs.writeFile(cardBPath(), cardB)
    const commit = vi.fn(async (_o: { rootPath: string; filePaths: string[]; commitMessage: string }) => {})
    await Promise.all([
      markRepliedImpl({ companyRoot: root, fileName: "2026-09-28-ama.md", now, gitCommitFile: commit }),
      markRepliedImpl({ companyRoot: root, fileName: "2026-09-28-kwaku.md", now, gitCommitFile: commit }),
    ])
    const log = yaml.parse(await fs.readFile(logPath(), "utf-8"))
    expect(log.replied_count).toBe(2)
    expect(log.records).toHaveLength(2)
    expect(log.records.map((r: { id: string }) => r.id).sort()).toEqual(["inq-a", "inq-b"])
  })
})
