import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string
let dataDir: string

const OUTPUT = path.join("notes/company/digests", "2026-09-29-digest.md")
const okExec = async () => ({ stdout: "", stderr: "" })

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "first-saved-root-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "first-saved-data-"))
  vi.doMock("../config", () => ({
    AGENTS: [{ id: "test-co", name: "Test Co", rootPath: root, kind: "command-set" }],
  }))
  await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
  await writeFile(path.join(root, OUTPUT), "content")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

async function commit(
  afterCommit?: (dir: string, info: { commandId: string; outputKind: "new-file-in-dir" | "known-file" }) => Promise<void>,
  execFn: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }> = okExec,
  relative: string = OUTPUT
) {
  const { commitCompanyCommandResultImpl } = await import("./commit-company-command-result-impl")
  return commitCompanyCommandResultImpl("digest", relative, "test-co", execFn, dataDir, undefined, afterCommit)
}

describe("commitCompanyCommandResultImpl afterCommit", () => {
  it("runs once, with the company's run-data directory, after a successful commit", async () => {
    const afterCommit = vi.fn(async () => {})
    const result = await commit(afterCommit)
    expect(result).toEqual({ committed: true, message: "Committed" })
    expect(afterCommit).toHaveBeenCalledTimes(1)
    expect(afterCommit).toHaveBeenCalledWith(dataDir, { commandId: "digest", outputKind: "new-file-in-dir" })
  })

  it("does not run when the commit is refused", async () => {
    const afterCommit = vi.fn(async () => {})
    const result = await commit(afterCommit, okExec, path.join("notes/company/other", "x.md"))
    expect(result.committed).toBe(false)
    expect(afterCommit).not.toHaveBeenCalled()
  })

  it("does not run when git fails", async () => {
    const afterCommit = vi.fn(async () => {})
    const result = await commit(afterCommit, async () => {
      throw new Error("git exploded")
    })
    expect(result.committed).toBe(false)
    expect(afterCommit).not.toHaveBeenCalled()
  })

  it("never turns a saved approval into a reported failure when it throws", async () => {
    const afterCommit = vi.fn(async () => {
      throw new Error("disk full")
    })
    const result = await commit(afterCommit)
    expect(result).toEqual({ committed: true, message: "Committed" })
  })

  it("commits normally when nothing is passed", async () => {
    expect(await commit()).toEqual({ committed: true, message: "Committed" })
  })
})
