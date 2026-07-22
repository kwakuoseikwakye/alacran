import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import * as fsModule from "node:fs"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "trigger-poll-test-"))
  await mkdir(path.join(root, "logs"), { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("triggerPoll", () => {
  it("spawns bin/poll.sh with the correct command/args/cwd when no lock is held", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" }],
    }))
    const { triggerPoll } = await import("./trigger-poll")

    const spawnCalls: { command: string; args: string[]; options: { cwd: string; detached: boolean } }[] = []
    const fakeSpawn = (command: string, args: string[], options: { cwd: string; detached: boolean; stdio: ["ignore", number, number] }) => {
      spawnCalls.push({ command, args, options })
      return { unref: () => {} }
    }

    const result = await triggerPoll(fakeSpawn)

    expect(result).toEqual({ started: true, message: "Poll started" })
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0].command).toBe("bash")
    expect(spawnCalls[0].args).toEqual([path.join(root, "bin", "poll.sh")])
    expect(spawnCalls[0].options.cwd).toBe(root)
    expect(spawnCalls[0].options.detached).toBe(true)
  })

  it("does not spawn and reports 'Already running' when state/poll.lock exists", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" }],
    }))
    await mkdir(path.join(root, "state", "poll.lock"), { recursive: true })
    const { triggerPoll } = await import("./trigger-poll")

    let spawnCalled = false
    const fakeSpawn = () => {
      spawnCalled = true
      return { unref: () => {} }
    }

    const result = await triggerPoll(fakeSpawn)

    expect(result).toEqual({ started: false, message: "Already running" })
    expect(spawnCalled).toBe(false)
  })

  it("reports the error message and does not throw when spawning fails", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" }],
    }))
    const { triggerPoll } = await import("./trigger-poll")

    const fakeSpawn = () => {
      throw new Error("spawn failed")
    }

    const result = await triggerPoll(fakeSpawn)

    expect(result).toEqual({ started: false, message: "spawn failed" })
  })

  it("reports an error when email-pipeline-agent isn't in AGENTS", async () => {
    vi.doMock("./config", () => ({ AGENTS: [] }))
    const { triggerPoll } = await import("./trigger-poll")

    const result = await triggerPoll(() => ({ unref: () => {} }))

    expect(result).toEqual({ started: false, message: 'Agent "email-pipeline-agent" is not configured' })
  })

  it("closes fds even when spawnFn throws, proving the fd leak is fixed", async () => {
    vi.doMock("./config", () => ({
      AGENTS: [{ id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" }],
    }))

    const mockCloseSync = vi.fn()

    vi.doMock("node:fs", async (importOriginal) => {
      const actual = await importOriginal() as Record<string, unknown>
      return {
        ...actual,
        closeSync: mockCloseSync,
      }
    })

    const { triggerPoll } = await import("./trigger-poll")

    const fakeSpawn = () => {
      throw new Error("spawn failed")
    }

    const result = await triggerPoll(fakeSpawn)

    expect(result).toEqual({ started: false, message: "spawn failed" })
    expect(mockCloseSync).toHaveBeenCalledTimes(2)
  })
})
