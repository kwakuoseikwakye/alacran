import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { AI_EXECUTORS } from "../ai-executors"

let root: string
let dataDir: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "run-company-command-test-"))
  dataDir = await mkdtemp(path.join(tmpdir(), "run-company-command-data-"))
  // Every pre-existing test below asserts on Claude Code's exact flags and
  // expects the "claude" binary — this keeps that behavior byte-identical
  // now that the executor is resolved through a new, real (fs-touching)
  // dependency instead of being hardcoded.
  vi.doMock("../ai-executor-registry", () => ({
    resolveAiExecutorForAgent: async () => AI_EXECUTORS["claude-code"],
  }))
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
    const result = await runCompanyCommandImpl(
      "create-epic",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: 'Unknown command "create-epic"' })
    expect(calls).toHaveLength(0)
  })

  it("rejects a run missing a required field", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "retro",
      { keep: "x", problem: "y" },
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

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
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: 'Unknown field "bogus"' })
    expect(calls).toHaveLength(0)
  })

  it("spawns claude with -p, --allowedTools Edit-scoped to the output dir, Bash disallowed, permission-mode default, for a new-file-in-dir command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: { cwd: string; detached: boolean } }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(calls[0].args).toContain("-p")
    expect(calls[0].args).toContain("--allowedTools")
    expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe(
      "Read,Grep,Glob,Edit(notes/company/digests/**)"
    )
    expect(calls[0].args).toContain("--disallowedTools")
    expect(calls[0].args[calls[0].args.indexOf("--disallowedTools") + 1]).toBe("Bash")
    expect(calls[0].args).toContain("--permission-mode")
    expect(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1]).toBe("default")
    expect(calls[0].options.cwd).toBe(root)
    expect(calls[0].options.detached).toBe(true)

    const record = JSON.parse(await readFile(path.join(dataDir, "digest.run.json"), "utf-8"))
    expect(record).toEqual({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
  })

  it("scopes --allowedTools' Edit rule to the exact file for a known-file command", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    await mkdir(path.join(root, "definitions", "ontology"), { recursive: true })
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "define-company",
      { domain: "d", stakeholders: "s", valueFlow: "v", bottleneck: "b" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe(
      "Read,Grep,Glob,Edit(definitions/ontology/company.yaml)"
    )
  })

  it("does not spawn and reports 'Already running' when the lock is already held", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { acquireRunLock } = await import("./run-lock")
    await acquireRunLock(dataDir)
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

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
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      throwingSpawn as never,
      undefined,
      dataDir
    )

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
      "ai-company-starter-main",
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
    const result = await runCompanyCommandImpl(
      "handoff",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      fakeExec,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    const promptIndex = calls[0].args.indexOf("-p") + 1
    expect(calls[0].args[promptIndex]).toContain("gh unavailable or not authenticated")
  })

  it("reports an error for an unknown agentId", async () => {
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const result = await runCompanyCommandImpl("digest", { period: "" }, "no-such-agent", undefined, undefined, dataDir)

    expect(result).toEqual({ started: false, message: 'Unknown company "no-such-agent"' })
  })

  it("keeps two agents' locks and run records fully isolated", async () => {
    const secondRoot = await mkdtemp(path.join(tmpdir(), "run-company-command-second-"))
    try {
      vi.doMock("../config", () => ({
        AGENTS: [
          { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" },
          { id: "second-co", name: "Second Co", rootPath: secondRoot, kind: "command-set" },
        ],
      }))
      const { runCompanyCommandImpl } = await import("./run-company-command-impl")
      const dataDirA = path.join(dataDir, "ai-company-starter-main")
      const dataDirB = path.join(dataDir, "second-co")

      const callsA: { command: string; args: string[]; options: unknown }[] = []
      const callsB: { command: string; args: string[]; options: unknown }[] = []
      const resultA = await runCompanyCommandImpl(
        "digest",
        { period: "" },
        "ai-company-starter-main",
        fakeSpawn(callsA) as never,
        undefined,
        dataDirA
      )
      const resultB = await runCompanyCommandImpl(
        "digest",
        { period: "" },
        "second-co",
        fakeSpawn(callsB) as never,
        undefined,
        dataDirB
      )

      expect(resultA).toEqual({ started: true, message: "Started" })
      expect(resultB).toEqual({ started: true, message: "Started" })
      expect(callsA[0].options).toMatchObject({ cwd: root })
      expect(callsB[0].options).toMatchObject({ cwd: secondRoot })

      const recordA = JSON.parse(await readFile(path.join(dataDirA, "digest.run.json"), "utf-8"))
      const recordB = JSON.parse(await readFile(path.join(dataDirB, "digest.run.json"), "utf-8"))
      expect(recordA.commandId).toBe("digest")
      expect(recordB.commandId).toBe("digest")
    } finally {
      await rm(secondRoot, { recursive: true, force: true })
    }
  })

  it("grants scoped Bash(gog ...) tools and omits --disallowedTools for a command declaring bashPatterns", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "check-inbox",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe(
      "Read,Grep,Glob,Edit(notes/company/email-checks/**),Bash(gog -a auto gmail search*),Bash(gog -a auto gmail get*)"
    )
    expect(calls[0].args).not.toContain("--disallowedTools")
  })

  it("spawns the resolved executor's binary and args instead of a hardcoded 'claude', when a company is assigned a different one", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const fakeExecutor = {
      id: "aider" as const,
      label: "Aider",
      binaryName: "aider",
      installHint: "pipx install aider-chat",
      installLink: "https://aider.chat/docs/install.html",
      buildArgs: ({ prompt }: { prompt: string }) => ["--message", prompt, "--yes-always"],
    }
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir,
      async () => fakeExecutor
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls[0].command).toBe("aider")
    expect(calls[0].args[0]).toBe("--message")
    expect(calls[0].args).toContain("--yes-always")
    expect(calls[0].args).not.toContain("--allowedTools")
  })

  it("passes the resolved agent's id (not a hardcoded one) to resolveExecutor", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "second-co", name: "Second Co", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const resolvedFor: string[] = []
    const calls: { command: string; args: string[]; options: unknown }[] = []
    await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "second-co",
      fakeSpawn(calls) as never,
      undefined,
      dataDir,
      async (agentId: string) => {
        resolvedFor.push(agentId)
        return AI_EXECUTORS["claude-code"]
      }
    )

    expect(resolvedFor).toEqual(["second-co"])
  })
})
