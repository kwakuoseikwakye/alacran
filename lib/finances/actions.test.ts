import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { approveRecommendation, discardRecommendation, markSavingsRealized } from "./actions"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

const mockAgent = {
  id: "test-co",
  rootPath: "",
}

vi.mock("../get-effective-agents", () => ({
  getEffectiveAgents: vi.fn(async () => [mockAgent]),
}))

const committedCalls: Array<{ commitMessage: string; [key: string]: unknown }> = []
vi.mock("../git-commit-file", () => ({
  gitCommitFile: vi.fn(async (opts) => {
    committedCalls.push(opts)
  }),
}))

describe("finances actions", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "alacran-actions-test-"))
    mockAgent.rootPath = tmpDir
    committedCalls.length = 0
    await fs.mkdir(path.join(tmpDir, "notes", "finances", "recommendations"), { recursive: true })
    await fs.mkdir(path.join(tmpDir, "records", "finances"), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it("approves recommendation and commits changes", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-sub.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-1"
status: "pending"
---
Details`
    )

    const result = await approveRecommendation("test-co", "2026-09-27-sub.md")
    expect(result.ok).toBe(true)
    expect(result.message).toBe("Recommendation approved")

    const content = await fs.readFile(recFile, "utf-8")
    expect(content).toContain('status: "approved"')
    expect(committedCalls).toHaveLength(1)
    expect(committedCalls[0].commitMessage).toContain("approve recommendation")
  })

  it("rejects unsafe file name in approveRecommendation", async () => {
    const result = await approveRecommendation("test-co", "../hack.md")
    expect(result.ok).toBe(false)
    expect(result.message).toContain("Invalid recommendation file")
  })

  it("discards recommendation by deleting file and committing", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-sub.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-1"
status: "pending"
---
Details`
    )

    const result = await discardRecommendation("test-co", "2026-09-27-sub.md")
    expect(result.ok).toBe(true)
    expect(result.message).toBe("Recommendation discarded")

    await expect(fs.access(recFile)).rejects.toThrow()
    expect(committedCalls).toHaveLength(1)
    expect(committedCalls[0].commitMessage).toContain("discard recommendation")
  })

  it("rejects unsafe file name in discardRecommendation", async () => {
    const result = await discardRecommendation("test-co", "../hack.md")
    expect(result.ok).toBe(false)
    expect(result.message).toContain("Invalid recommendation file")
  })

  it("marks savings realized via server action", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-sub.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-1"
vendor: "AWS"
status: "approved"
potential_savings_monthly: 200
---
Details`
    )

    const result = await markSavingsRealized("test-co", "2026-09-27-sub.md")
    expect(result.ok).toBe(true)

    const content = await fs.readFile(recFile, "utf-8")
    expect(content).toContain('status: "realized"')
    expect(committedCalls).toHaveLength(1)
  })

  it("returns error if company not found", async () => {
    const result = await approveRecommendation("unknown-co", "2026-09-27-sub.md")
    expect(result.ok).toBe(false)
    expect(result.message).toBe("Company not found")
  })

  it("is idempotent when recommendation is already approved without committing", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-approved.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-app"
vendor: "Figma"
status: "approved"
potential_savings_monthly: 50
---
Already approved details`
    )

    const result = await approveRecommendation("test-co", "2026-09-27-approved.md")
    expect(result.ok).toBe(true)
    expect(result.message).toBe("Recommendation already approved")
    expect(committedCalls).toHaveLength(0)
  })

  it("anchors status replacement strictly within YAML frontmatter without replacing body occurrences", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-body.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-body"
status: "pending"
---
### Audit finding & rationale
The current status: proposed should remain unaffected.
Another note: status: pending here as well.`
    )

    const result = await approveRecommendation("test-co", "2026-09-27-body.md")
    expect(result.ok).toBe(true)

    const content = await fs.readFile(recFile, "utf-8")
    expect(content).toContain('status: "approved"')
    expect(content).toContain("The current status: proposed should remain unaffected.")
    expect(content).toContain("Another note: status: pending here as well.")
  })

  it("handles unhandled exceptions gracefully in markSavingsRealized", async () => {
    const { getEffectiveAgents } = await import("../get-effective-agents")
    vi.mocked(getEffectiveAgents).mockRejectedValueOnce(new Error("Database connection dropped"))

    const result = await markSavingsRealized("test-co", "2026-09-27-sub.md")
    expect(result.ok).toBe(false)
    expect(result.message).toBe("Database connection dropped")
  })
})
