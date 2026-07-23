import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getDailyTeamLogResultImpl } from "./daily-team-log-result-impl"

let root: string
let logPath: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "daily-team-log-result-test-"))
  logPath = path.join(root, "run.log")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("getDailyTeamLogResultImpl", () => {
  it("reports not-yet-run when the log file doesn't exist", async () => {
    const result = await getDailyTeamLogResultImpl(logPath)
    expect(result).toEqual({ ranAtLeastOnce: false, lastLine: null })
  })

  it("returns the last non-empty line of the log", async () => {
    await writeFile(logPath, "some earlier output\n\nno reports to write\n\n")
    const result = await getDailyTeamLogResultImpl(logPath)
    expect(result).toEqual({ ranAtLeastOnce: true, lastLine: "no reports to write" })
  })

  it("returns the last non-empty line even without a trailing newline", async () => {
    await writeFile(logPath, "line one\nWrote reports for: 2026-07-21, 2026-07-22")
    const result = await getDailyTeamLogResultImpl(logPath)
    expect(result).toEqual({ ranAtLeastOnce: true, lastLine: "Wrote reports for: 2026-07-21, 2026-07-22" })
  })

  it("reports ranAtLeastOnce true with a null lastLine if the log file is empty", async () => {
    await writeFile(logPath, "")
    const result = await getDailyTeamLogResultImpl(logPath)
    expect(result).toEqual({ ranAtLeastOnce: true, lastLine: null })
  })
})
