import { describe, it, expect, vi } from "vitest"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ChildProcess } from "node:child_process"
import { openInteractiveTerminalWithHelpImpl } from "./open-interactive-terminal-with-help-impl"
import type { SpawnFn } from "./open-interactive-terminal-impl"
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

describe("openInteractiveTerminalWithHelpImpl", () => {
  it("refuses an unknown agent id without spawning or checking freshness", async () => {
    const { spawnFn } = fakeSpawn()
    const execFn = vi.fn(async () => ({ stdout: "", stderr: "" }))
    const result = await openInteractiveTerminalWithHelpImpl(
      "nope",
      spawnFn,
      async () => [AGENT],
      async () => AI_EXECUTORS["claude-code"],
      "darwin",
      undefined,
      execFn
    )
    expect(result).toEqual({ started: false, message: "Unknown company" })
    expect(spawnFn).not.toHaveBeenCalled()
    expect(execFn).not.toHaveBeenCalled()
  })

  // Open in Terminal opens to external folders; Get Started must NOT follow.
  // Its intro prompt reads skills and an ontology an external folder has no
  // reason to own, so relaxing the shared impl's check must not leak here.
  it("refuses an external folder", async () => {
    const { spawnFn } = fakeSpawn()
    const execFn = vi.fn(async () => ({ stdout: "", stderr: "" }))
    const result = await openInteractiveTerminalWithHelpImpl(
      "acme",
      spawnFn,
      async () => [{ ...AGENT, kind: "external" as const }],
      async () => AI_EXECUTORS["claude-code"],
      "darwin",
      undefined,
      execFn
    )
    expect(result).toEqual({ started: false, message: "Unknown company" })
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it("refuses a non-command-set agent", async () => {
    const { spawnFn } = fakeSpawn()
    const pipelineAgent: Agent = { ...AGENT, kind: "pipeline" }
    const result = await openInteractiveTerminalWithHelpImpl(
      "acme",
      spawnFn,
      async () => [pipelineAgent],
      async () => AI_EXECUTORS["claude-code"],
      "darwin"
    )
    expect(result.started).toBe(false)
    expect(spawnFn).not.toHaveBeenCalled()
  })

  it("seeds a fresh session's script with the short 'read the summary' prompt when source_commit matches", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "get-started-"))
    try {
      const { spawnFn, calls } = fakeSpawn()
      const agent: Agent = { ...AGENT, rootPath: dir }
      const execFn = async () => ({ stdout: "abc123\n", stderr: "" })
      const readFileFn = async () => "---\nsource_commit: abc123\n---\n"
      const result = await openInteractiveTerminalWithHelpImpl(
        "acme",
        spawnFn,
        async () => [agent],
        async () => AI_EXECUTORS["claude-code"],
        "darwin",
        dir,
        execFn,
        readFileFn
      )
      expect(result.started).toBe(true)
      const script = await readFile(calls[0].args[2], "utf-8")
      expect(script).toContain("up to date")
      expect(script).not.toContain(".claude/skills/")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("seeds a stale session's script with the full regenerate prompt when the summary is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "get-started-"))
    try {
      const { spawnFn, calls } = fakeSpawn()
      const agent: Agent = { ...AGENT, rootPath: dir }
      const execFn = async () => ({ stdout: "abc123\n", stderr: "" })
      const readFileFn = async () => {
        throw new Error("ENOENT")
      }
      const result = await openInteractiveTerminalWithHelpImpl(
        "acme",
        spawnFn,
        async () => [agent],
        async () => AI_EXECUTORS["claude-code"],
        "darwin",
        dir,
        execFn,
        readFileFn
      )
      expect(result.started).toBe(true)
      const script = await readFile(calls[0].args[2], "utf-8")
      expect(script).toContain(".claude/skills/")
      expect(script).toContain("source_commit: abc123")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
