import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let logPath: string
let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "daily-team-log-log-tail-test-"))
  logPath = path.join(root, "run.log")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

describe("getDailyTeamLogLogTail", () => {
  it("returns empty tail when the log file doesn't exist", async () => {
    vi.doMock("./paths", () => ({ DAILY_TEAM_LOG_LOG_PATH: logPath }))
    const { getDailyTeamLogLogTail } = await import("./daily-team-log-log-tail")

    const result = await getDailyTeamLogLogTail()

    expect(result).toEqual({ tail: "" })
  })

  it("returns the log's tail when it exists", async () => {
    vi.doMock("./paths", () => ({ DAILY_TEAM_LOG_LOG_PATH: logPath }))
    await writeFile(logPath, "syncing repo...\nno reports to write\n")
    const { getDailyTeamLogLogTail } = await import("./daily-team-log-log-tail")

    const result = await getDailyTeamLogLogTail()

    expect(result).toEqual({ tail: "syncing repo...\nno reports to write" })
  })
})
