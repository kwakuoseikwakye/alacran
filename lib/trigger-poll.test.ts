import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

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
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
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
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
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
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
    }))
    const { triggerPoll } = await import("./trigger-poll")

    const fakeSpawn = () => {
      throw new Error("spawn failed")
    }

    const result = await triggerPoll(fakeSpawn)

    expect(result).toEqual({ started: false, message: "spawn failed" })
  })

  it("reports an error when plh-takeshi-agent isn't in AGENTS", async () => {
    vi.doMock("./config", () => ({ AGENTS: [] }))
    const { triggerPoll } = await import("./trigger-poll")

    const result = await triggerPoll(() => ({ unref: () => {} }))

    expect(result).toEqual({ started: false, message: 'Agent "plh-takeshi-agent" is not configured' })
  })
})
