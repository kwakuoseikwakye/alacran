import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { approveInquiry, discardInquiry, markReplied } from "./actions"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockAgent = { id: "test-co", rootPath: "" }
vi.mock("../get-effective-agents", () => ({ getEffectiveAgents: vi.fn(async () => [mockAgent]) }))

const commits: Array<{ filePaths: string[]; commitMessage: string }> = []
vi.mock("../git-commit-file", () => ({
  gitCommitFile: vi.fn(async (o) => {
    commits.push(o)
  }),
}))

const card = (status: string) => `---\nid: "inq-1"\nfrom: "Ama"\nchannel: "email"\nstatus: "${status}"\n---\n### Draft reply\nHi.`

describe("comms actions", () => {
  let root: string
  const file = () => path.join(root, "notes", "comms", "inquiries", "2026-09-28-ama.md")

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "alacran-comms-actions-"))
    mockAgent.rootPath = root
    commits.length = 0
    await fs.mkdir(path.dirname(file()), { recursive: true })
  })
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("approves a pending card and commits it", async () => {
    await fs.writeFile(file(), card("pending"))
    const res = await approveInquiry("test-co", "2026-09-28-ama.md")
    expect(res.ok).toBe(true)
    expect(await fs.readFile(file(), "utf-8")).toContain(`status: "approved"`)
    expect(commits).toHaveLength(1)
  })

  it("does not recommit an already-approved card", async () => {
    await fs.writeFile(file(), card("approved"))
    expect((await approveInquiry("test-co", "2026-09-28-ama.md")).ok).toBe(true)
    expect(commits).toHaveLength(0)
  })

  it("discards by deleting the card, without committing an untracked file", async () => {
    // This card was never `git add`ed (same as a fresh find-replies card) —
    // discard must not shell out to a commit for it. See discard-inquiry-git.test.ts
    // for the real-git tracked/untracked coverage.
    await fs.writeFile(file(), card("pending"))
    expect((await discardInquiry("test-co", "2026-09-28-ama.md")).ok).toBe(true)
    await expect(fs.access(file())).rejects.toThrow()
    expect(commits).toHaveLength(0)
  })

  it("marks replied through the impl", async () => {
    await fs.writeFile(file(), card("approved"))
    expect((await markReplied("test-co", "2026-09-28-ama.md")).ok).toBe(true)
    expect(await fs.readFile(path.join(root, "records", "comms", "inquiries.yaml"), "utf-8")).toContain("inq-1")
  })

  it.each([approveInquiry, discardInquiry, markReplied])("rejects traversal names (%#)", async (action) => {
    const res = await action("test-co", "../../records/comms/inquiries.yaml")
    expect(res.ok).toBe(false)
    expect(commits).toHaveLength(0)
  })

  it("reports an unknown company", async () => {
    expect(await approveInquiry("nope", "2026-09-28-ama.md")).toEqual({ ok: false, message: "Company not found" })
  })
})
