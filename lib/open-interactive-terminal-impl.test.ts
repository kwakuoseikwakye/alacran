import { describe, it, expect, vi } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ChildProcess } from "node:child_process"
import { openInteractiveTerminalImpl, type SpawnFn } from "./open-interactive-terminal-impl"
import type { Agent } from "./adapters/types"
import { AI_EXECUTORS } from "./ai-executors"

const AGENT: Agent = { id: "acme", name: "Acme", rootPath: "/companies/acme", kind: "command-set" }

function fakeSpawn() {
  const calls: Array<{ command: string; args: string[]; opts: Record<string, unknown> }> = []
  const spawnFn: SpawnFn = vi.fn((command: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ command, args, opts })
    return { unref: vi.fn(), on: vi.fn() } as unknown as ChildProcess
  })
  return { spawnFn, calls }
}

describe("openInteractiveTerminalImpl", () => {
  it("refuses an unknown agent id", async () => {
    const { spawnFn } = fakeSpawn()
    const result = await openInteractiveTerminalImpl(
      "nope",
      spawnFn,
      async () => [AGENT],
      async () => AI_EXECUTORS["claude-code"],
      "darwin"
    )
    expect(result).toEqual({ started: false, message: "Unknown company" })
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it("refuses a non-command-set agent", async () => {
    const { spawnFn } = fakeSpawn()
    const pipelineAgent: Agent = { ...AGENT, kind: "pipeline" }
    const result = await openInteractiveTerminalImpl(
      "acme",
      spawnFn,
      async () => [pipelineAgent],
      async () => AI_EXECUTORS["claude-code"],
      "darwin"
    )
    expect(result.started).toBe(false)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  // Open in Terminal is the ONE action an external folder gets. This is the
  // only kind check that opens to it — Get Started guards separately.
  //
  // dataDir must be a real temp dir: this test runs past the guard to the
  // launcher-script write, and the default DATA_DIR is process.cwd()/.data,
  // which exists on a dev machine but not on a clean CI checkout. Every other
  // test here that reaches the write does the same.
  it("opens a terminal for an external folder", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "open-terminal-external-"))
    try {
      const { spawnFn, calls } = fakeSpawn()
      const externalAgent: Agent = { ...AGENT, kind: "external", rootPath: dir }
      const result = await openInteractiveTerminalImpl(
        "acme",
        spawnFn,
        async () => [externalAgent],
        async () => AI_EXECUTORS["claude-code"],
        "darwin",
        dir
      )
      expect(result.started).toBe(true)
      expect(calls).toHaveLength(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("refuses on Linux without spawning anything when no terminal emulator is installed", async () => {
    const { spawnFn } = fakeSpawn()
    const execFn = async () => {
      throw new Error("not found")
    }
    const result = await openInteractiveTerminalImpl(
      "acme",
      spawnFn,
      async () => [AGENT],
      async () => AI_EXECUTORS["claude-code"],
      "linux",
      undefined,
      execFn
    )
    expect(result.started).toBe(false)
    expect(result.message).toContain("No supported terminal")
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it("opens whichever Linux terminal emulator is actually installed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "open-terminal-"))
    try {
      const { spawnFn, calls } = fakeSpawn()
      const agent: Agent = { ...AGENT, rootPath: dir }
      // x-terminal-emulator (tried first) is missing; konsole is installed.
      const execFn = async (command: string, args: string[]) => {
        if (command === "which" && args[0] === "konsole") return { stdout: "/usr/bin/konsole", stderr: "" }
        throw new Error("not found")
      }
      const result = await openInteractiveTerminalImpl(
        "acme",
        spawnFn,
        async () => [agent],
        async () => AI_EXECUTORS["claude-code"],
        "linux",
        dir,
        execFn
      )
      expect(result).toEqual({ started: true, message: "Opened Terminal" })
      expect(calls).toHaveLength(1)
      expect(calls[0].command).toBe("konsole")
      expect(calls[0].args[0]).toBe("-e")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("writes an executable script and spawns 'open -a Terminal' with it, cwd'd to the company root", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "open-terminal-"))
    try {
      const { spawnFn, calls } = fakeSpawn()
      const agent: Agent = { ...AGENT, rootPath: dir }
      const result = await openInteractiveTerminalImpl(
        "acme",
        spawnFn,
        async () => [agent],
        async () => AI_EXECUTORS["claude-code"],
        "darwin",
        dir
      )
      expect(result).toEqual({ started: true, message: "Opened Terminal" })
      expect(calls).toHaveLength(1)
      expect(calls[0].command).toBe("open")
      expect(calls[0].args[0]).toBe("-a")
      expect(calls[0].args[1]).toBe("Terminal")
      const scriptPath = calls[0].args[2]
      expect(calls[0].opts.cwd).toBe(dir)
      const script = await readFile(scriptPath, "utf-8")
      expect(script).toContain("exec \"$BINARY\"")
      expect(script).toContain(`CWD='${dir}'`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("with an introPrompt, seeds the script with the executor's interactive-intro args and uses its own script filename", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "open-terminal-"))
    try {
      const { spawnFn, calls } = fakeSpawn()
      const agent: Agent = { ...AGENT, rootPath: dir }
      const result = await openInteractiveTerminalImpl(
        "acme",
        spawnFn,
        async () => [agent],
        async () => AI_EXECUTORS["claude-code"],
        "darwin",
        dir,
        undefined,
        "read the skills and say hi"
      )
      expect(result).toEqual({ started: true, message: "Opened Terminal" })
      const scriptPath = calls[0].args[2]
      expect(scriptPath).toContain("get-started")
      const script = await readFile(scriptPath, "utf-8")
      expect(script).toContain("exec \"$BINARY\" 'read the skills and say hi'")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("with an introPrompt but an executor that can't be seeded (aider), opens plain and says so", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "open-terminal-"))
    try {
      const { spawnFn, calls } = fakeSpawn()
      const agent: Agent = { ...AGENT, rootPath: dir }
      const result = await openInteractiveTerminalImpl(
        "acme",
        spawnFn,
        async () => [agent],
        async () => AI_EXECUTORS.aider,
        "darwin",
        dir,
        undefined,
        "read the skills and say hi"
      )
      expect(result.started).toBe(true)
      expect(result.message).toContain("can't be seeded")
      const scriptPath = calls[0].args[2]
      const script = await readFile(scriptPath, "utf-8")
      expect(script).toContain('exec "$BINARY"\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
