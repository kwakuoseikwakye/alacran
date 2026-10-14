import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { promises as fs } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"
import os from "node:os"
import { discardInquiry } from "./actions"

// Real git path: gitCommitFile is NOT mocked here, unlike actions.test.ts.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockAgent = { id: "test-co", rootPath: "" }
vi.mock("../get-effective-agents", () => ({ getEffectiveAgents: vi.fn(async () => [mockAgent]) }))

const card = (status: string) =>
  `---\nid: "inq-1"\nfrom: "Ama"\nchannel: "email"\nstatus: "${status}"\n---\n### Draft reply\nHi.`

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf-8" })
}

function commitCount(root: string): number {
  return Number(git(root, "rev-list", "--count", "--all").trim())
}

describe("discardInquiry against a real git repo", () => {
  let root: string
  const relPath = path.join("notes", "comms", "inquiries", "2026-09-28-ama.md")
  const file = () => path.join(root, relPath)

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "alacran-comms-discard-git-"))
    mockAgent.rootPath = root
    git(root, "init", "-q")
    git(root, "config", "user.name", "Test")
    git(root, "config", "user.email", "test@example.com")
    await fs.mkdir(path.dirname(file()), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("discards an untracked card without creating a commit", async () => {
    // A card the find-replies job just wrote: on disk, never git-added.
    await fs.writeFile(file(), card("pending"))

    const res = await discardInquiry("test-co", "2026-09-28-ama.md")

    expect(res).toEqual({ ok: true, message: "Discarded" })
    await expect(fs.access(file())).rejects.toThrow()
    expect(commitCount(root)).toBe(0)
  })

  it("discards a tracked card and commits the removal", async () => {
    await fs.writeFile(file(), card("pending"))
    git(root, "add", "--", relPath)
    git(root, "commit", "-q", "-m", "add inquiry")
    const before = commitCount(root)

    const res = await discardInquiry("test-co", "2026-09-28-ama.md")

    expect(res).toEqual({ ok: true, message: "Discarded" })
    await expect(fs.access(file())).rejects.toThrow()
    expect(git(root, "status", "--porcelain").trim()).toBe("")
    expect(commitCount(root)).toBe(before + 1)
    expect(git(root, "log", "-1", "--pretty=%B")).toContain("discard inquiry")
  })
})
