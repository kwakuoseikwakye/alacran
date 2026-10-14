import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string
let dataDir: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "batch-approve-test-root-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "batch-approve-test-data-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  vi.doUnmock("./company-command-result-impl")
  vi.resetModules()
})

describe("batchCommitSafeReviewsImpl", () => {
  it("commits safe items and rejects high-risk items from the batch", async () => {
    const resolvedRoot = await realpath(root)
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "test-co", name: "Test Co", rootPath: resolvedRoot, kind: "command-set" }],
    }))

    // 1. Create safe item: digest
    await mkdir(path.join(resolvedRoot, "notes/company/digests"), { recursive: true })
    const digestPath = "notes/company/digests/2026-09-19-digest.md"
    await writeFile(path.join(resolvedRoot, digestPath), "# Weekly summary\nHighlights.")
    const companyDataDir = path.join(dataDir, "test-co")
    await mkdir(companyDataDir, { recursive: true })
    await writeFile(
      path.join(companyDataDir, "digest.run.json"),
      JSON.stringify({
        commandId: "digest",
        outputKind: "new-file-in-dir",
        outputPath: "notes/company/digests",
        before: [],
      })
    )

    // 2. Create high-risk item: decision ADR
    await mkdir(path.join(resolvedRoot, "docs/decisions"), { recursive: true })
    const decisionPath = "docs/decisions/2026-09-19-policy.md"
    await writeFile(path.join(resolvedRoot, decisionPath), "# Decision\nBinding policy.")
    await writeFile(
      path.join(companyDataDir, "decision.run.json"),
      JSON.stringify({
        commandId: "decision",
        outputKind: "new-file-in-dir",
        outputPath: "docs/decisions",
        before: [],
      })
    )

    const calls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    const { batchCommitSafeReviewsImpl } = await import("./batch-approve-impl")

    const res = await batchCommitSafeReviewsImpl(
      [
        { commandId: "digest", outputPath: digestPath, agentId: "test-co" },
        { commandId: "decision", outputPath: decisionPath, agentId: "test-co" },
      ],
      fakeExec,
      dataDir
    )

    // Digest should be committed
    expect(res.committed).toContain("test-co:digest")
    // Decision must be refused from batch commit
    expect(res.failed.some((f) => f.key === "test-co:decision")).toBe(true)
    expect(res.failed.find((f) => f.key === "test-co:decision")?.error).toContain("High risk")

    // Git calls should only have committed the digest
    expect(calls.some((c) => c.args.includes(digestPath))).toBe(true)
    expect(calls.some((c) => c.args.includes(decisionPath))).toBe(false)
  })

  it("handles unknown companies gracefully", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [],
    }))
    const { batchCommitSafeReviewsImpl } = await import("./batch-approve-impl")

    const res = await batchCommitSafeReviewsImpl(
      [{ commandId: "digest", outputPath: "some/path.md", agentId: "ghost" }],
      undefined,
      dataDir
    )

    expect(res.committed).toHaveLength(0)
    expect(res.failed[0].error).toContain("Unknown company")
  })

  it("refuses to batch-approve a review that carries owned files", async () => {
    const getResultMock = vi.fn().mockResolvedValue({
      changed: true,
      outputPath: "notes/company/sessions/a.md",
      oldText: "",
      newText: "x",
      extraFiles: [],
      strays: [],
      ownedFiles: [{ path: "definitions/ontology/company.yaml", oldText: "a", newText: "b", isNew: false }],
    })
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "acme", name: "Acme", rootPath: root, kind: "command-set" }],
    }))
    vi.doMock("./company-command-result-impl", () => ({ getCompanyCommandResultImpl: getResultMock }))
    const { batchCommitSafeReviewsImpl } = await import("./batch-approve-impl")

    const res = await batchCommitSafeReviewsImpl(
      [{ commandId: "session-note", outputPath: "notes/company/sessions/a.md", agentId: "acme" }],
      undefined,
      dataDir
    )

    expect(res.committed).toEqual([])
    expect(res.failed[0].error).toMatch(/High risk/)
  })

  it("refuses to batch-approve a note that proposes fact changes (v234 I5)", async () => {
    const getResultMock = vi.fn().mockResolvedValue({
      changed: true,
      outputPath: "notes/company/sessions/a.md",
      oldText: "",
      newText: "# S\n\n## Proposed fact changes\n- fact | pricing | fixed | was: hourly | \"q\"\n",
      extraFiles: [],
      strays: [],
    })
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "acme", name: "Acme", rootPath: root, kind: "command-set" }],
    }))
    vi.doMock("./company-command-result-impl", () => ({ getCompanyCommandResultImpl: getResultMock }))
    const { batchCommitSafeReviewsImpl } = await import("./batch-approve-impl")

    const res = await batchCommitSafeReviewsImpl(
      [{ commandId: "session-note", outputPath: "notes/company/sessions/a.md", agentId: "acme" }],
      undefined,
      dataDir
    )

    expect(res.committed).toEqual([])
    expect(res.failed[0].error).toMatch(/Medium risk/)
  })
})
