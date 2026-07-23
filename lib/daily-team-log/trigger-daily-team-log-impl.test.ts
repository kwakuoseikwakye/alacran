import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { triggerDailyTeamLogImpl } from "./trigger-daily-team-log-impl"
import { checkLockStatus } from "../file-lock"

let configRoot: string
let configPath: string
let dataDir: string
let lockPath: string
let logPath: string

const VALID_CONFIG = {
  person: "Nana",
  projects: ["Kirirom-plh"],
  output_repo: "/tmp/fake-plh-ops/reports",
  timezone: "Asia/Tokyo",
  lookback_days: 3,
  bootstrapped: true,
}

beforeEach(async () => {
  configRoot = await mkdtemp(path.join(tmpdir(), "trigger-daily-team-log-test-"))
  configPath = path.join(configRoot, "config.json")
  dataDir = await mkdtemp(path.join(tmpdir(), "trigger-daily-team-log-data-"))
  lockPath = path.join(dataDir, "run.lock")
  logPath = path.join(dataDir, "run.log")
})

afterEach(async () => {
  await rm(configRoot, { recursive: true, force: true })
  await rm(dataDir, { recursive: true, force: true })
})

function fakeSpawn(calls: { command: string; args: string[]; options: unknown }[]) {
  return (command: string, args: string[], options: unknown) => {
    calls.push({ command, args, options })
    return { unref: () => {}, on: () => {} }
  }
}

describe("triggerDailyTeamLogImpl", () => {
  it("refuses to spawn when config is not found, without touching the lock", async () => {
    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await triggerDailyTeamLogImpl(configPath, lockPath, logPath, fakeSpawn(calls))

    expect(result).toEqual({
      started: false,
      message: "Not set up on this machine yet — run the daily-team-log skill's one-time setup first.",
    })
    expect(calls).toHaveLength(0)
    expect(await checkLockStatus(lockPath)).toEqual({ running: false })
  })

  it("spawns claude with the built prompt and the expected allowedTools/permission-mode when config is valid", async () => {
    await writeFile(configPath, JSON.stringify(VALID_CONFIG))
    const calls: { command: string; args: string[]; options: { cwd: string; detached: boolean } }[] = []

    const result = await triggerDailyTeamLogImpl(configPath, lockPath, logPath, fakeSpawn(calls) as never)

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(calls[0].args).toContain("-p")
    const allowedToolsIndex = calls[0].args.indexOf("--allowedTools") + 1
    const allowedTools = calls[0].args[allowedToolsIndex]
    expect(allowedTools).toContain("Edit(/tmp/fake-plh-ops/reports/**)")
    expect(allowedTools).not.toContain("Write")
    expect(allowedTools).toContain("Bash(git -C /tmp/fake-plh-ops pull*)")
    expect(allowedTools).toContain("Bash(git -C /tmp/fake-plh-ops push*)")
    expect(allowedTools).toContain("Bash(git -C /tmp/fake-plh-ops/reports add*)")
    expect(allowedTools).toContain("Bash(git -C /tmp/fake-plh-ops/reports commit*)")
    expect(allowedTools).toContain("Bash(python3 /tmp/fake-plh-ops/workflow/daily-team-log/gather.py*)")
    expect(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1]).toBe("default")
    expect(calls[0].args).not.toContain("--add-dir")
    expect(calls[0].options.cwd).toBe("/tmp/fake-plh-ops")
    expect(calls[0].options.detached).toBe(true)
  })

  it("does not spawn and reports 'Already running' when the lock is already held", async () => {
    await writeFile(configPath, JSON.stringify(VALID_CONFIG))
    const { acquireLock } = await import("../file-lock")
    await acquireLock(lockPath)

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await triggerDailyTeamLogImpl(configPath, lockPath, logPath, fakeSpawn(calls))

    expect(result).toEqual({ started: false, message: "Already running" })
    expect(calls).toHaveLength(0)
  })

  it("reports an error and releases the lock when spawning throws", async () => {
    await writeFile(configPath, JSON.stringify(VALID_CONFIG))
    const throwingSpawn = () => {
      throw new Error("spawn claude ENOENT")
    }

    const result = await triggerDailyTeamLogImpl(configPath, lockPath, logPath, throwingSpawn as never)

    expect(result).toEqual({ started: false, message: "spawn claude ENOENT" })
    expect(await checkLockStatus(lockPath)).toEqual({ running: false })
  })
})
