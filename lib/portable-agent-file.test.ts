import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const getEffectiveAgents = vi.fn()
vi.mock("./get-effective-agents", () => ({ getEffectiveAgents: () => getEffectiveAgents() }))

const { needsPortableAgentFile, addPortableAgentFileImpl, CLAUDE_POINTER } = await import("./portable-agent-file")

const WORKING_AGREEMENT = "# Working agreement\n\nOur own hand-edited rules.\n"

let root: string

async function company(files: Record<string, string>) {
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(root, name), body, "utf-8")
  }
  getEffectiveAgents.mockResolvedValue([{ id: "acme", rootPath: root, kind: "command-set" }])
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "portable-agent-"))
  getEffectiveAgents.mockReset()
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("needsPortableAgentFile", () => {
  it("is true only for a company that has CLAUDE.md and no AGENTS.md", async () => {
    expect(await needsPortableAgentFile(root)).toBe(false)
    await writeFile(path.join(root, "CLAUDE.md"), WORKING_AGREEMENT, "utf-8")
    expect(await needsPortableAgentFile(root)).toBe(true)
    await writeFile(path.join(root, "AGENTS.md"), WORKING_AGREEMENT, "utf-8")
    expect(await needsPortableAgentFile(root)).toBe(false)
  })
})

describe("addPortableAgentFileImpl", () => {
  it("moves the user's own edits to AGENTS.md and leaves a pointer, in one commit", async () => {
    await company({ "CLAUDE.md": WORKING_AGREEMENT })
    const calls: string[][] = []
    const execFn = vi.fn(async (_cmd: string, args: string[]) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    })

    const result = await addPortableAgentFileImpl("acme", execFn)

    expect(result).toEqual({ ok: true })
    // The whole point: the text the user actually wrote survives the move.
    expect(await readFile(path.join(root, "AGENTS.md"), "utf-8")).toBe(WORKING_AGREEMENT)
    expect(await readFile(path.join(root, "CLAUDE.md"), "utf-8")).toBe(CLAUDE_POINTER)
    // Pathspec-scoped, both files, one commit — not `git add -A`.
    expect(calls[0]).toEqual(["-C", root, "add", "--", "AGENTS.md", "CLAUDE.md"])
    expect(calls[1]?.slice(-3)).toEqual(["--", "AGENTS.md", "CLAUDE.md"])
    expect(calls).toHaveLength(2)
  })

  it("refuses rather than overwriting an AGENTS.md the user already has", async () => {
    await company({ "CLAUDE.md": WORKING_AGREEMENT, "AGENTS.md": "mine, do not touch\n" })
    const execFn = vi.fn()

    const result = await addPortableAgentFileImpl("acme", execFn)

    expect(result.ok).toBe(false)
    expect(await readFile(path.join(root, "AGENTS.md"), "utf-8")).toBe("mine, do not touch\n")
    expect(execFn).not.toHaveBeenCalled()
  })

  it("writes nothing for a company with no working agreement to move", async () => {
    await company({})
    const execFn = vi.fn()

    const result = await addPortableAgentFileImpl("acme", execFn)

    expect(result.ok).toBe(false)
    expect(execFn).not.toHaveBeenCalled()
  })

  it("refuses an `external` folder, which is someone else's repo", async () => {
    await company({ "CLAUDE.md": WORKING_AGREEMENT })
    getEffectiveAgents.mockResolvedValue([{ id: "acme", rootPath: root, kind: "external" }])
    const execFn = vi.fn()

    const result = await addPortableAgentFileImpl("acme", execFn)

    expect(result.ok).toBe(false)
    expect(execFn).not.toHaveBeenCalled()
  })
})

it("keeps the pointer identical to the one a NEW company is scaffolded with", async () => {
  // Two sources for the same prose is the drift this pins: a backfilled
  // company and a freshly scaffolded one must end up byte-identical, or the
  // two paths quietly diverge and nobody notices — both files read fine alone.
  const template = await readFile(
    path.join(process.cwd(), "templates", "company-starter", "CLAUDE.md"),
    "utf-8"
  )
  expect(template).toBe(CLAUDE_POINTER)
})
