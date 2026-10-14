import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, readFile, rm, writeFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { AI_EXECUTORS } from "../ai-executors"
import { CANVA_DESIGN_TOOLS } from "../content-social/canva-tools"
import { readRunningCommand } from "./running-command"

/** An executor that reports no tool scope. Deliberately not a registered one —
 *  every executor in the registry enforces a scope (v99), and this guard has to
 *  keep being provable after that stopped being a mix. */
const unscopedExecutor = {
  ...AI_EXECUTORS["claude-code"],
  label: "Some Other CLI",
  binaryName: "other-cli",
  enforcesToolScope: false,
  buildArgs: ({ prompt }: { prompt: string }) => ["--message", prompt, "--yes-always"],
}
import type { SpawnedProcess } from "./run-company-command-impl"

/** A spawned terminal launcher that hands its window off and exits 0 at once,
 *  which is what `open -a Terminal` and gnome-terminal really do — the run
 *  inside carries on long after. */
function handOffChild(onCalls?: string[]): SpawnedProcess {
  return {
    unref: () => {},
    on: ((event: string, listener: (code: number | null) => void) => {
      onCalls?.push(event)
      if (event === "exit") listener(0)
    }) as SpawnedProcess["on"],
  }
}

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
  // Every pre-existing test below (i.e. every call that doesn't pass its
  // own resolveVisibleRun argument) must stay on the headless path
  // regardless of what a real developer's on-disk .data/visible-runs.json
  // actually contains — otherwise this suite's result depends on whether
  // the maintainer happens to have the setting on for a real company.
  // Tests that exercise visible mode explicitly pass their own
  // resolveVisibleRun function, which overrides this mock entirely.
  vi.doMock("../visible-run-registry", () => ({
    getVisibleRunForAgent: async () => false,
  }))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
  // vi.doMock registrations outlive resetModules() and, unlike a cleanup line
  // at the end of a test body, this runs even if that test's own assertions
  // throw first — so a single mocked ./prefetch never leaks into later tests.
  vi.doUnmock("./prefetch")
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

  /**
   * `session-note` only means something to an agent mid-conversation. Spawned
   * headlessly it would be asked to describe a session that never happened,
   * and the failure is not a crash — it is a confidently written, entirely
   * invented memory landing in the company's own notes. Nothing in the UI can
   * reach this today (no template .md file, so no Run button; not
   * schedulable), and the guard is here because those are configuration and
   * this is the function.
   */
  it("refuses a live-session command outright, before the lock or any spawn", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "session-note",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls),
      undefined,
      dataDir
    )

    expect(result.started).toBe(false)
    expect(result.message).toMatch(/session that's already open/i)
    expect(calls).toHaveLength(0)
    // No run record either: a refusal must not enter the approval queue.
    await expect(stat(path.join(dataDir, "session-note.run.json"))).rejects.toThrow()
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
    expect(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1]).toBe("manual")
    // A digest is summarising upkeep, so it runs on the cheapest model.
    expect(calls[0].args[calls[0].args.indexOf("--model") + 1]).toBe("haiku")
    expect(calls[0].options.cwd).toBe(root)
    expect(calls[0].options.detached).toBe(true)

    const record = JSON.parse(await readFile(path.join(dataDir, "digest.run.json"), "utf-8"))
    // beforeDirty is the whole-repo baseline the stray-file check subtracts
    // from. Null here because this fixture root is not a git repo — which is
    // itself the contract: unreadable git means "couldn't tell", never
    // "nothing strayed".
    expect(record).toEqual({
      commandId: "digest",
      outputKind: "new-file-in-dir",
      outputPath: "notes/company/digests",
      before: [],
      beforeDirty: null,
      // Taken at the same moment: the run is when the agent is asked to do lane work (v234 C1).
      ownedBaseline: null,
    })
  })

  it("records which command is running, and on which AI, as soon as it holds the lock", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("digest", { period: "" }, "ai-company-starter-main", fakeSpawn(calls) as never, undefined, dataDir)

    expect(result.started).toBe(true)
    const marker = JSON.parse(await readFile(path.join(dataDir, "running-command.json"), "utf-8"))
    expect(marker).toMatchObject({ commandId: "digest", executorId: "claude-code" })
    expect(Number.isNaN(Date.parse(marker.startedAt))).toBe(false)
  })

  it("writes no marker for a run it refuses before the lock", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    await runCompanyCommandImpl("create-epic", {}, "ai-company-starter-main", fakeSpawn([]), undefined, dataDir)
    await expect(stat(path.join(dataDir, "running-command.json"))).rejects.toThrow()
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
    const { writeRunningCommand } = await import("./running-command")
    // Seed a marker for a different command (holder's marker)
    const holderMarker = { commandId: "refresh", executorId: "claude-code", startedAt: new Date().toISOString() }
    await writeRunningCommand(dataDir, holderMarker)
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
    // A losing contender must never overwrite the lock holder's marker
    expect(await readRunningCommand(dataDir)).toEqual(holderMarker)
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

  it("refuses before spawning when prefetch refuses, releasing the lock and never calling spawnFn", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    vi.doMock("./prefetch", () => ({
      runPrefetch: async () => ({ ok: false, message: "No matching email found" }),
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const { checkRunLockStatus } = await import("./run-lock")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: "No matching email found" })
    expect(calls).toHaveLength(0)
    expect(await checkRunLockStatus(dataDir)).toEqual({ running: false })
  })

  it("leaves an existing .run.json untouched when prefetch refuses", async () => {
    // A refusal is the first way (new in v32) to reach the end of a run without
    // spawning. If it still took a fresh before-snapshot, that snapshot would
    // include a previous run's still-unconfirmed output file — so the result
    // reader would report "No changes produced." and the operator's pending
    // review would be destroyed even though the file is still on disk.
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    vi.doMock("./prefetch", () => ({
      runPrefetch: async () => ({ ok: false, message: "No matching email found" }),
    }))
    const pending = JSON.stringify({
      commandId: "digest",
      outputKind: "new-file-in-dir",
      outputPath: "notes/company/digests",
      before: [],
    })
    await writeFile(path.join(dataDir, "digest.run.json"), pending, "utf-8")
    // The unconfirmed result the operator is still reviewing.
    await mkdir(path.join(root, "notes", "company", "digests"), { recursive: true })
    await writeFile(path.join(root, "notes", "company", "digests", "2026-08-04-digest.md"), "draft", "utf-8")

    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: false, message: "No matching email found" })
    expect(calls).toHaveLength(0)
    expect(await readFile(path.join(dataDir, "digest.run.json"), "utf-8")).toBe(pending)
  })

  it("prefetches the company's own git history for refresh and embeds it in the prompt", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const execCalls: { command: string; args: string[] }[] = []
    const fakeExec = async (command: string, args: string[]) => {
      execCalls.push({ command, args })
      // The "when was the ontology last committed" probe answers first; every
      // later git call then runs against that sha.
      if (args[0] === "log" && args.includes("--format=%H")) return { stdout: "deadbee\n", stderr: "" }
      if (args[0] === "diff") return { stdout: "notes/clients/acme.md\n", stderr: "" }
      return { stdout: "abc1234 fix: something\n", stderr: "" }
    }

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "refresh",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      fakeExec,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(execCalls[0]).toEqual({
      command: "git",
      args: ["log", "-1", "--format=%H", "--", "definitions/ontology/company.yaml"],
    })
    const promptIndex = calls[0].args.indexOf("-p") + 1
    expect(calls[0].args[promptIndex]).toContain("abc1234 fix: something")
    expect(calls[0].args[promptIndex]).toContain("notes/clients/acme.md")
    // Scoped to the one file it may edit, and no Bash at all.
    expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe(
      "Read,Grep,Glob,Edit(definitions/ontology/company.yaml)"
    )
    expect(calls[0].args).toContain("--disallowedTools")
  })

  it("still runs refresh when git can't answer, rather than refusing", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const fakeExec = async () => {
      throw new Error("git: command not found")
    }

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "refresh",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      fakeExec,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    const promptIndex = calls[0].args.indexOf("-p") + 1
    expect(calls[0].args[promptIndex]).toContain("unable to read git log")
  })

  describe("learn-preferences", () => {
    const cursorPath = () => path.join(dataDir, "preferences-cursor.json")
    const mockAgent = () =>
      vi.doMock("../config", () => ({
        AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
      }))
    const seed = async (n: number) => {
      const { recordOutcome } = await import("../os/preferences/outcomes")
      for (let i = 0; i < n; i++) await recordOutcome(dataDir, { command: "digest", outcome: "revised", kind: "known-file", files: 1, feedback: `make it shorter ${i}` })
    }

    it("is refused on an executor that cannot enforce a tool scope, with no cursor written", async () => {
      mockAgent()
      const { runCompanyCommandImpl } = await import("./run-company-command-impl")
      await seed(3)
      const calls: { command: string; args: string[]; options: unknown }[] = []
      const result = await runCompanyCommandImpl("learn-preferences", {}, "ai-company-starter-main", fakeSpawn(calls) as never, undefined, dataDir, async () => unscopedExecutor)
      expect(result.started).toBe(false)
      expect(result.message).toContain("reads content written by people outside this company")
      expect(calls).toHaveLength(0)
      await expect(stat(cursorPath())).rejects.toThrow()
    })

    it("refuses with no cursor written when there is no feedback", async () => {
      mockAgent()
      const { runCompanyCommandImpl } = await import("./run-company-command-impl")
      const calls: { command: string; args: string[]; options: unknown }[] = []
      const result = await runCompanyCommandImpl("learn-preferences", {}, "ai-company-starter-main", fakeSpawn(calls) as never, undefined, dataDir)
      expect(result).toEqual({ started: false, message: "There's no new feedback to learn from yet." })
      expect(calls).toHaveLength(0)
      await expect(stat(cursorPath())).rejects.toThrow()
    })

    it("leaves the cursor alone when a later step ends the run (scope setup throws, terminal fails to open)", async () => {
      mockAgent()
      await seed(3)
      vi.doMock("../executor-scope", () => ({ prepareExecutorScope: async () => { throw new Error("scope boom") } }))
      let mod = await import("./run-company-command-impl")
      const r1 = await mod.runCompanyCommandImpl("learn-preferences", {}, "ai-company-starter-main", fakeSpawn([]) as never, undefined, dataDir)
      expect(r1).toEqual({ started: false, message: "scope boom" })
      await expect(stat(cursorPath())).rejects.toThrow()
      vi.doUnmock("../executor-scope")
      vi.resetModules()
      mockAgent()
      mod = await import("./run-company-command-impl")
      const failingLauncher = () => ({ unref: () => {}, on: ((event: string, l: (code: number | null) => void) => { if (event === "exit") l(1) }) as SpawnedProcess["on"] })
      const r2 = await mod.runCompanyCommandImpl("learn-preferences", {}, "ai-company-starter-main", failingLauncher as never, undefined, dataDir, undefined, async () => true, "darwin")
      expect(r2.started).toBe(false)
      expect(r2.message).toContain("Couldn't open a terminal")
      await expect(stat(cursorPath())).rejects.toThrow()
    })

    it("spawns with the fenced feedback and a one-file edit scope, advancing the cursor only then", async () => {
      mockAgent()
      const { runCompanyCommandImpl } = await import("./run-company-command-impl")
      await seed(3)
      await expect(stat(cursorPath())).rejects.toThrow()
      const calls: { command: string; args: string[]; options: unknown }[] = []
      const result = await runCompanyCommandImpl("learn-preferences", {}, "ai-company-starter-main", fakeSpawn(calls) as never, undefined, dataDir)
      expect(result).toEqual({ started: true, message: "Started" })
      const prompt = calls[0].args[calls[0].args.indexOf("-p") + 1]
      expect(prompt).toMatch(/--- UNTRUSTED:[0-9a-f]{16} ---/)
      expect(prompt).toContain("digest (3 revisions)")
      expect(prompt).toContain('"make it shorter 2"')
      expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe("Read,Grep,Glob,Edit(definitions/preferences.md)")
      expect((await stat(cursorPath())).isFile()).toBe(true)
      const { readCursor } = await import("../os/preferences/offer")
      expect(await readCursor(dataDir)).toBeGreaterThan(0)
    })
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

  it("spawns the resolved executor's binary and args instead of a hardcoded 'claude', when a company is assigned a different one", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const fakeExecutor = unscopedExecutor
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
    expect(calls[0].command).toBe("other-cli")
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

  it("runs visibly (open -a Terminal, generated script, lock left to the script) when the company has visible runs enabled on darwin", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const onCalls: string[] = []
    const spawnFn = (command: string, args: string[], options: unknown) => {
      calls.push({ command, args, options })
      return handOffChild(onCalls)
    }

    const result = await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true, // resolveVisibleRun
      "darwin"
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("open")
    expect(calls[0].args[0]).toBe("-a")
    expect(calls[0].args[1]).toBe("Terminal")
    const scriptPath = calls[0].args[2]
    expect(scriptPath).toBe(path.join(dataDir, "digest.run.sh"))
    // The crux of the whole design, asserted as the property rather than the
    // mechanism: the fake above HAS exited 0 by now, and the lock is still
    // held. The launcher returns the instant the window opens, long before the
    // run inside finishes, so a clean exit must never be read as completion —
    // the script's own `trap ... EXIT` owns the lock's lifetime. (An exit
    // listener does now get registered, because a launcher that dies on
    // arrival is the one case where the script never runs at all.)
    const { runLockPath } = await import("./run-lock")
    expect((await stat(runLockPath(dataDir))).isFile()).toBe(true)
    // Always registered, on every path: an unhandled "error" event is an
    // uncaught exception, and here it is also the only thing that can
    // release a lock the script will never get far enough to trap.
    expect(onCalls).toContain("error")
    // Marker is written immediately after lock, before visible/headless split
    const marker = await readRunningCommand(dataDir)
    expect(marker).toMatchObject({ commandId: "digest", executorId: "claude-code" })
  })

  it("falls back to headless on Linux when visible runs is enabled but no terminal emulator is installed", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const onCalls: string[] = []
    const spawnFn = (command: string, args: string[], options: unknown) => {
      calls.push({ command, args, options })
      return { unref: () => {}, on: (event: string) => { onCalls.push(event) } }
    }
    // Every `which <terminal>` probe fails — none of the candidates are installed.
    const execFn = async () => {
      throw new Error("not found")
    }

    await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      execFn,
      dataDir,
      undefined,
      async () => true, // resolveVisibleRun — enabled, but no terminal emulator resolves
      "linux"
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(onCalls).toEqual(["exit", "error"])
  })

  it("runs visibly on Linux using whichever terminal emulator the which-probe finds first", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const onCalls: string[] = []
    const spawnFn = (command: string, args: string[], options: unknown) => {
      calls.push({ command, args, options })
      return handOffChild(onCalls)
    }
    // x-terminal-emulator (tried first) is missing; gnome-terminal is installed.
    const execFn = async (command: string, args: string[]) => {
      if (command === "which" && args[0] === "gnome-terminal") return { stdout: "/usr/bin/gnome-terminal", stderr: "" }
      throw new Error("not found")
    }

    const result = await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      execFn,
      dataDir,
      undefined,
      async () => true, // resolveVisibleRun
      "linux"
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("gnome-terminal")
    // gnome-terminal takes `--` before the command, unlike the `-e` the rest use.
    expect(calls[0].args[0]).toBe("--")
    expect(calls[0].args[1]).toBe(path.join(dataDir, "digest.run.sh"))
    // The crux of the whole design, asserted as the property rather than the
    // mechanism: the fake above HAS exited 0 by now, and the lock is still
    // held. The launcher returns the instant the window opens, long before the
    // run inside finishes, so a clean exit must never be read as completion —
    // the script's own `trap ... EXIT` owns the lock's lifetime. (An exit
    // listener does now get registered, because a launcher that dies on
    // arrival is the one case where the script never runs at all.)
    const { runLockPath } = await import("./run-lock")
    expect((await stat(runLockPath(dataDir))).isFile()).toBe(true)
    // Always registered, on every path: an unhandled "error" event is an
    // uncaught exception, and here it is also the only thing that can
    // release a lock the script will never get far enough to trap.
    expect(onCalls).toContain("error")
  })

  it("stays headless on darwin when visible runs is not enabled for the company", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const onCalls: string[] = []
    const spawnFn = (command: string, args: string[], options: unknown) => {
      calls.push({ command, args, options })
      return { unref: () => {}, on: (event: string) => { onCalls.push(event) } }
    }

    await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => false, // resolveVisibleRun — disabled, and platform IS darwin
      "darwin"
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(onCalls).toEqual(["exit", "error"])
  })

  it("derives the visible-run script's lock path from the same runLockPath the rest of the app uses", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const { runLockPath } = await import("./run-lock")
    const { shQuote } = await import("./build-visible-run-script")

    const spawnFn = () => handOffChild()

    await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true,
      "darwin"
    )

    const script = await readFile(path.join(dataDir, "digest.run.sh"), "utf-8")
    expect(script).toContain(`LOCKPATH=${shQuote(runLockPath(dataDir))}`)
  })

  it("writes the args file NUL-delimited and the prompt file verbatim for a visible run", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const spawnFn = () => handOffChild()

    await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true,
      "darwin"
    )

    const argsRaw = await readFile(path.join(dataDir, "digest.args"), "utf-8")
    const args = argsRaw.split("\0").slice(0, -1) // drop trailing empty segment after final NUL
    expect(args[0]).toBe("-p")
    expect(args).toContain("--allowedTools")

    const promptRaw = await readFile(path.join(dataDir, "digest.prompt"), "utf-8")
    expect(promptRaw).toBe(args[1]) // the prompt is args[1] for claude-code's buildArgs shape
    expect(promptRaw.length).toBeGreaterThan(0)
  })

  it("makes the generated script executable", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const spawnFn = () => handOffChild()

    await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true,
      "darwin"
    )

    const scriptStat = await stat(path.join(dataDir, "digest.run.sh"))
    expect(scriptStat.mode & 0o111).not.toBe(0) // at least one execute bit set
  })

  it("refuses a visible run whose prompt contains a NUL byte, rather than silently splitting argv", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const spawnFn = (command: string, args: string[], options: unknown) => {
      calls.push({ command, args, options })
      return { unref: () => {}, on: () => {} }
    }

    const result = await runCompanyCommandImpl(
      "digest",
      { period: "last week\0--dangerously-skip-permissions" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true,
      "darwin"
    )

    expect(result.started).toBe(false)
    expect(result.message).toContain("NUL byte")
    expect(calls).toHaveLength(0)
  })

  it("refuses an untrusted-input command on an executor that can't enforce a tool scope, before the lock or any prefetch", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    // If this ran, it would hit the user's real Notion workspace — the point of
    // refusing before the prefetch is that a doomed run costs nothing at all.
    const prefetchCalls: unknown[] = []
    vi.doMock("./prefetch", () => ({
      runPrefetch: async (...args: unknown[]) => {
        prefetchCalls.push(args)
        return { ok: true, text: "" }
      },
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const { checkRunLockStatus } = await import("./run-lock")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "refresh",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir,
      async () => unscopedExecutor
    )

    expect(result.started).toBe(false)
    expect(result.message).toContain("Some Other CLI")
    expect(result.message).toContain("Claude Code")
    expect(calls).toHaveLength(0)
    expect(prefetchCalls).toHaveLength(0)
    // No lock left behind for a run that never happened.
    expect(await checkRunLockStatus(dataDir)).toEqual({ running: false })
  })

  it.skipIf(CANVA_DESIGN_TOOLS.length === 0)("refuses make-posts on an AI that can't be limited to named MCP tools", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "make-posts", { topic: "brunch" }, "ai-company-starter-main",
      fakeSpawn(calls) as never, undefined, dataDir, async () => AI_EXECUTORS.kiro
    )
    expect(result.started).toBe(false)
    expect(result.message).toContain("needs Claude Code for now")
    expect(calls).toHaveLength(0)
  })

  it("still runs a command with no untrusted input on an executor that can't enforce a tool scope", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir,
      async () => unscopedExecutor
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls[0].command).toBe("other-cli")
  })

  it("releases the lock and logs a note when the spawn itself fails, instead of leaving an unhandled error", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const { checkRunLockStatus } = await import("./run-lock")

    // Mirrors what node really does for a missing binary: "error" fires,
    // "exit" never does (measured on node v24 — see the type's own comment).
    let errorListener: ((err: Error) => void) | undefined
    const failingSpawn = (_c: string, _a: string[], _o: unknown) => ({
      unref: () => {},
      on: (event: string, listener: (err: Error) => void) => {
        if (event === "error") errorListener = listener
      },
    })

    const result = await runCompanyCommandImpl(
      "digest",
      { period: "" },
      "ai-company-starter-main",
      failingSpawn as never,
      undefined,
      dataDir
    )
    expect(result).toEqual({ started: true, message: "Started" })
    expect(errorListener).toBeDefined()
    expect(await checkRunLockStatus(dataDir)).toEqual({ running: true })

    errorListener!(new Error("spawn claude ENOENT"))
    await vi.waitFor(async () => {
      expect(await checkRunLockStatus(dataDir)).toEqual({ running: false })
    })

    const log = await readFile(path.join(dataDir, "digest.log"), "utf-8")
    expect(log).toContain("could not start")
    expect(log).toContain("spawn claude ENOENT")
  })
})


describe("revision execution", () => {
  it("revises within the existing document scope without resetting the unread baseline", async () => {
    vi.doMock("../config", () => ({ AGENTS: [{ id: "ai-company-starter-main", name: "Test", rootPath: root, kind: "command-set" }] }))
    const outputPath = "notes/company/digests/draft.md"
    await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
    await writeFile(path.join(root, outputPath), "Original draft")
    const baseline = JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [], beforeDirty: [] })
    await writeFile(path.join(dataDir, "digest.run.json"), baseline)
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("digest", {}, "ai-company-starter-main", fakeSpawn(calls), undefined, dataDir, undefined, undefined, undefined, { feedback: "Correct the date", outputPath, expectedText: "Original draft" })
    expect(result.started).toBe(true)
    expect(calls[0].args.join(" ")).toContain("Edit(notes/company/digests/draft.md)")
    expect(calls[0].args.join(" ")).not.toContain("Edit(notes/company/digests/**)")
    expect(await readFile(path.join(dataDir, "digest.run.json"), "utf-8")).toBe(baseline)
  })
})

describe("a second run while posts are still waiting", () => {
  const recordPath = () => path.join(dataDir, "make-posts.run.json")
  const postsDir = () => path.join(root, "notes/content/posts")

  it("keeps the earlier run's baseline, so its unapproved posts stay waiting", async () => {
    vi.doMock("../config", () => ({ AGENTS: [{ id: "ai-company-starter-main", name: "Test", rootPath: root, kind: "command-set" }] }))
    await mkdir(postsDir(), { recursive: true })
    await writeFile(path.join(postsDir(), "a.md"), "## Caption\nWaiting")
    await writeFile(recordPath(), JSON.stringify({ commandId: "make-posts", outputKind: "new-file-in-dir", outputPath: "notes/content/posts", before: [], beforeDirty: [] }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("make-posts", { topic: "brunch" }, "ai-company-starter-main", fakeSpawn(calls) as never, undefined, dataDir)
    expect(result.started).toBe(true)
    const record = JSON.parse(await readFile(recordPath(), "utf-8"))
    expect(record.before).not.toContain("a.md")
    expect(record.before).toEqual([])
    expect(record.beforeDirty).toEqual([])
  })

  it("takes a fresh snapshot when nothing is waiting", async () => {
    vi.doMock("../config", () => ({ AGENTS: [{ id: "ai-company-starter-main", name: "Test", rootPath: root, kind: "command-set" }] }))
    await mkdir(postsDir(), { recursive: true })
    await writeFile(path.join(postsDir(), "a.md"), "## Caption\nPosted")
    // .DS_Store is not a post, so it doesn't count as waiting.
    await writeFile(path.join(postsDir(), ".DS_Store"), "")
    await writeFile(recordPath(), JSON.stringify({ commandId: "make-posts", outputKind: "new-file-in-dir", outputPath: "notes/content/posts", before: ["a.md"], beforeDirty: [] }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const calls: { command: string; args: string[]; options: unknown }[] = []
    await runCompanyCommandImpl("make-posts", { topic: "brunch" }, "ai-company-starter-main", fakeSpawn(calls) as never, undefined, dataDir)
    const record = JSON.parse(await readFile(recordPath(), "utf-8"))
    expect([...record.before].sort()).toEqual([".DS_Store", "a.md"])
    expect(record.beforeDirty).toBeNull()
  })
})

describe("a command that declares a commit trailer", { timeout: 20_000 }, () => {
  afterEach(() => {
    vi.doUnmock("./registry")
  })

  it("writes the command's commit trailer into the run record", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "acme", name: "Acme", rootPath: root, kind: "command-set" }],
    }))
    vi.doMock("./registry", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./registry")>()),
      getCompanyCommand: (id: string) =>
        id === "apply-session-facts"
          ? {
              id: "apply-session-facts",
              commandFileName: "apply-session-facts.md",
              label: "Apply session facts",
              fields: [
                { key: "note", label: "Note", required: true, multiline: false },
                { key: "lines", label: "Lines", required: true, multiline: true },
              ],
              outputKind: "known-file",
              outputPath: "definitions/ontology/company.yaml",
              commitTrailer: (f: Record<string, string>) => `Applied facts from: ${f.note}`,
              buildPrompt: () => "p",
            }
          : undefined,
    }))
    await mkdir(path.join(root, "definitions", "ontology"), { recursive: true })
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "apply-session-facts",
      { note: "notes/company/sessions/a.md", lines: '- fact | a | b | was: c | "q"' },
      "acme",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    const record = JSON.parse(await readFile(path.join(dataDir, "apply-session-facts.run.json"), "utf-8"))
    expect(record.trailer).toBe("Applied facts from: notes/company/sessions/a.md")
  })
})

describe("a command that declares alsoWrites", () => {
  async function runWith(alsoWrites: string[] | undefined, revision?: Record<string, string>, extra: object = {}) {
    vi.doMock("../config", () => ({ AGENTS: [{ id: "ai-company-starter-main", name: "Test", rootPath: root, kind: "command-set" }] }))
    vi.doMock("./registry", async () => {
      const real = await vi.importActual<typeof import("./registry")>("./registry")
      return {
        ...real,
        getCompanyCommand: (id: string) => {
          const c = real.getCompanyCommand(id)
          return c && alsoWrites ? { ...c, alsoWrites, ...extra } : c
        },
      }
    })
    const outputPath = "notes/company/digests/draft.md"
    if (revision) {
      await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
      await writeFile(path.join(root, outputPath), "Original draft")
      await writeFile(path.join(dataDir, "digest.run.json"), JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [], beforeDirty: [] }))
    }
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl("digest", {}, "ai-company-starter-main", fakeSpawn(calls), undefined, dataDir, undefined, undefined, undefined, revision ? { feedback: "Fix", outputPath, expectedText: "Original draft" } : undefined)
    expect(result.started).toBe(true)
    vi.doUnmock("./registry")
    return calls[0].args.join(" ")
  }

  it("widens the scope: a directory becomes dir/** and a file stays itself", async () => {
    const args = await runWith(["docs/decisions/", "definitions/ontology/company.yaml"])
    expect(args).toContain("Edit(notes/company/digests/**),Edit(docs/decisions/**),Edit(definitions/ontology/company.yaml)")
  })

  it("leaves a command without alsoWrites with the single scope", async () => {
    const args = await runWith(undefined)
    expect(args.match(/Edit\(/g)).toHaveLength(1)
  })

  it("keeps a revision narrow", async () => {
    const args = await runWith(["docs/decisions/"], { x: "y" })
    expect(args).toContain("Edit(notes/company/digests/draft.md)")
    expect(args).not.toContain("Edit(docs/decisions")
  })

  it("never widens the scope of a command that reads untrusted input", async () => {
    const args = await runWith(["docs/decisions/"], undefined, { untrustedInput: true })
    expect(args).toContain("Edit(notes/company/digests/**)")
    expect(args).not.toContain("Edit(docs/decisions")
  })
})

describe("the owner's preferences in a drafting prompt", () => {
  const PREFS = "# Owner preferences\n\n- Keep replies short. (3 revisions: \"too long\")\n"
  const promptOf = async (commandId: string, prefs: string | null, revision?: { feedback: string; outputPath: string; expectedText: string }) => {
    vi.doMock("../config", () => ({ AGENTS: [{ id: "ai-company-starter-main", name: "Test", rootPath: root, kind: "command-set" }] }))
    if (prefs !== null) {
      await mkdir(path.join(root, "definitions"), { recursive: true })
      await writeFile(path.join(root, "definitions/preferences.md"), prefs)
    }
    if (revision) {
      await mkdir(path.join(root, "notes/company/digests"), { recursive: true })
      await writeFile(path.join(root, revision.outputPath), revision.expectedText)
      await writeFile(path.join(dataDir, "digest.run.json"), JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [], beforeDirty: [] }))
    }
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")
    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(commandId, {}, "ai-company-starter-main", fakeSpawn(calls) as never, undefined, dataDir, undefined, undefined, undefined, revision)
    expect(result.started).toBe(true)
    return calls[0].args[calls[0].args.indexOf("-p") + 1]
  }

  it("is appended to a digest run, and gone once the owner deletes the line", async () => {
    expect(await promptOf("digest", PREFS)).toContain("- Keep replies short.")
    await rm(path.join(root, "definitions/preferences.md"))
    await rm(path.join(dataDir, "digest.lock"), { force: true, recursive: true })
    vi.resetModules()
    const next = await mkdtemp(path.join(tmpdir(), "run-company-command-data-"))
    const saved = dataDir
    dataDir = next
    try {
      expect(await promptOf("digest", null)).not.toContain("Keep replies short")
    } finally {
      dataDir = saved
      await rm(next, { recursive: true, force: true })
    }
  })

  it("does not carry a proposal that is still waiting for approval", async () => {
    // pending review: the run record exists and the file differs from its baseline (root is not a git repo, so nothing is committed)
    await mkdir(path.join(root, "definitions"), { recursive: true })
    await writeFile(path.join(dataDir, "learn-preferences.run.json"), JSON.stringify({ commandId: "learn-preferences", outputKind: "known-file", outputPath: "definitions/preferences.md", before: "", beforeDirty: [] }))
    expect(await promptOf("digest", "# Owner preferences\n\n- Proposed unapproved line.\n")).not.toContain("Proposed unapproved line")
  })

  it("never reaches refresh", async () => {
    expect(await promptOf("refresh", PREFS)).not.toContain("Keep replies short.")
  })

  it("never reaches learn-preferences", async () => {
    const { recordOutcome } = await import("../os/preferences/outcomes")
    for (let i = 0; i < 3; i++) await recordOutcome(dataDir, { command: "digest", outcome: "revised", kind: "known-file", files: 1, feedback: `shorter ${i}` })
    expect(await promptOf("learn-preferences", PREFS)).not.toContain("Owner preferences (the owner approved")
  })

  it("never reaches a revision of a digest proposal", async () => {
    const outputPath = "notes/company/digests/draft.md"
    const prompt = await promptOf("digest", PREFS, { feedback: "Correct the date", outputPath, expectedText: "Original draft" })
    expect(prompt).not.toContain("Keep replies short.")
  })
})
