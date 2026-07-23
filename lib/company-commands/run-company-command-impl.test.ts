import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string
let dataDir: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "run-company-command-test-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "run-company-command-data-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

function fakeSpawn(calls: { command: string; args: string[]; options: unknown }[]) {
  return (command: string, args: string[], options: unknown) => {
    calls.push({ command, args, options })
    return { unref: () => {}, on: () => {} }
  }
}

describe("runCompanyCommandImpl", () => {
  it("rejects an unknown commandId before touching the lock or spawning", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("create-epic", {}, fakeSpawn(calls), undefined, dataDir)

    expect(result).toEqual({ started: false, message: 'Unknown command "create-epic"' })
    expect(calls).toHaveLength(0)
  })

  it("rejects a run missing a required field", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("retro", { keep: "x", problem: "y" }, fakeSpawn(calls), undefined, dataDir)

    expect(result).toEqual({ started: false, message: 'Field "Try — 1-3 improvements for next cycle" is required' })
    expect(calls).toHaveLength(0)
  })

  it("rejects an unknown field key", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "last week", bogus: "x" },
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: 'Unknown field "bogus"' })
    expect(calls).toHaveLength(0)
  })

  it("spawns claude with -p, --add-dir scoped to the output dir, and Bash disallowed, for a new-file-in-dir command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: { cwd: string; detached: boolean } }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(calls[0].args).toContain("-p")
    expect(calls[0].args).toContain("--add-dir")
    expect(calls[0].args[calls[0].args.indexOf("--add-dir") + 1]).toBe(path.join(root, "notes/company/digests"))
    expect(calls[0].args).toContain("--disallowedTools")
    expect(calls[0].args[calls[0].args.indexOf("--disallowedTools") + 1]).toBe("Bash")
    expect(calls[0].options.cwd).toBe(root)
    expect(calls[0].options.detached).toBe(true)

    const record = JSON.parse(await readFile(path.join(dataDir, "digest.run.json"), "utf-8"))
    expect(record).toEqual({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
  })

  it("scopes --add-dir to the containing directory for a known-file command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "definitions", "ontology"), { recursive: true })
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "define-company",
      { domain: "d", stakeholders: "s", valueFlow: "v", bottleneck: "b" },
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls[0].args[calls[0].args.indexOf("--add-dir") + 1]).toBe(path.join(root, "definitions", "ontology"))
  })

  it("does not spawn and reports 'Already running' when the lock is already held", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { acquireRunLock } = await import("./run-lock")
    await acquireRunLock(dataDir)
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("digest", { period: "" }, fakeSpawn(calls), undefined, dataDir)

    expect(result).toEqual({ started: false, message: "Already running" })
    expect(calls).toHaveLength(0)
  })

  it("reports an error and releases the lock when spawning throws", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const { checkRunLockStatus } = await import("./run-lock")

    const throwingSpawn = () => {
      throw new Error("spawn claude ENOENT")
    }
    const result = await runCompanyCommandImpl("digest", { period: "" }, throwingSpawn as never, undefined, dataDir)

    expect(result).toEqual({ started: false, message: "spawn claude ENOENT" })
    expect(await checkRunLockStatus(dataDir)).toEqual({ running: false })
  })

  it("prefetches git log and gh issue list for handoff and embeds them in the prompt", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const execCalls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      execCalls.push({ command, args })
      if (command === "git") return { stdout: "abc1234 fix: something\n", stderr: "" }
      return { stdout: "#12 Open issue example\n", stderr: "" }
    }

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "handoff",
      { blockers: "" },
      fakeSpawn(calls) as never,
      fakeExec,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(execCalls).toEqual([
      { command: "git", args: ["log", "--since=24 hours ago", "--oneline"] },
      { command: "gh", args: ["issue", "list", "--state", "open", "--limit", "10"] },
    ])
    const promptIndex = calls[0].args.indexOf("-p") + 1
    expect(calls[0].args[promptIndex]).toContain("abc1234 fix: something")
    expect(calls[0].args[promptIndex]).toContain("#12 Open issue example")
  })

  it("falls back gracefully when gh is unavailable for handoff's prefetch", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const fakeExec = async (command: string) => {
      if (command === "git") return { stdout: "", stderr: "" }
      throw new Error("gh: command not found")
    }

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("handoff", {}, fakeSpawn(calls) as never, fakeExec, dataDir)

    expect(result).toEqual({ started: true, message: "Started" })
    const promptIndex = calls[0].args.indexOf("-p") + 1
    expect(calls[0].args[promptIndex]).toContain("gh unavailable or not authenticated")
  })

  it("reports an error when ai-company-starter-main isn't configured", async () => {
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const result = await runCompanyCommandImpl("digest", { period: "" }, undefined, undefined, dataDir)

    expect(result).toEqual({ started: false, message: 'Agent "ai-company-starter-main" is not configured' })
  })
})
