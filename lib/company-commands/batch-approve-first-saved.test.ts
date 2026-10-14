import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string
let dataRoot: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "batch-first-saved-root-"))
  dataRoot = await mkdtemp(path.join(tmpdir(), "batch-first-saved-data-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataRoot, { recursive: true, force: true })
  vi.resetModules()
})

describe("batchCommitSafeReviewsImpl afterCommit", () => {
  it("runs once per committed item, with that company's run-data directory", async () => {
    const resolvedRoot = await realpath(root)
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "test-co", name: "Test Co", rootPath: resolvedRoot, kind: "command-set" }],
    }))
    await mkdir(path.join(resolvedRoot, "notes/company/digests"), { recursive: true })
    const digestPath = "notes/company/digests/2026-09-29-digest.md"
    await writeFile(path.join(resolvedRoot, digestPath), "# Weekly summary\nHighlights.")
    const companyDataDir = path.join(dataRoot, "test-co")
    await mkdir(companyDataDir, { recursive: true })
    await writeFile(
      path.join(companyDataDir, "digest.run.json"),
      JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
    )

    const fakeExec = async () => ({ stdout: "", stderr: "" })
    const afterCommit = vi.fn(async () => {})
    const { batchCommitSafeReviewsImpl } = await import("./batch-approve-impl")

    const result = await batchCommitSafeReviewsImpl(
      [{ commandId: "digest", outputPath: digestPath, agentId: "test-co" }],
      fakeExec,
      dataRoot,
      afterCommit
    )

    expect(result.committed).toEqual(["test-co:digest"])
    expect(afterCommit).toHaveBeenCalledTimes(1)
    expect(afterCommit).toHaveBeenCalledWith(companyDataDir, { commandId: "digest", outputKind: "new-file-in-dir" })
  })
})
