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
    return { unref: vi.fn() } as unknown as ChildProcess
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

  it("refuses on non-macOS without spawning anything", async () => {
    const { spawnFn } = fakeSpawn()
    const result = await openInteractiveTerminalImpl(
      "acme",
      spawnFn,
      async () => [AGENT],
      async () => AI_EXECUTORS["claude-code"],
      "linux"
    )
    expect(result.started).toBe(false)
    expect(result.message).toContain("macOS")
    expect(spawnFn).not.toHaveBeenCalled()
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
})
