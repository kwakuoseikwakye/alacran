import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { readDailyTeamLogConfig } from "./read-config"

let root: string
let configPath: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "read-config-test-"))
  configPath = path.join(root, "config.json")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("readDailyTeamLogConfig", () => {
  it("returns not-found when the config file doesn't exist", async () => {
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({ ok: false, reason: "not-found" })
  })

  it("returns invalid for malformed JSON", async () => {
    await writeFile(configPath, "{ not json")
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })

  it("returns not-bootstrapped when bootstrapped is not true", async () => {
    await writeFile(
      configPath,
      JSON.stringify({ person: null, projects: [], output_repo: null, bootstrapped: false })
    )
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({ ok: false, reason: "not-bootstrapped" })
  })

  it("returns invalid when bootstrapped but person/output_repo are missing", async () => {
    await writeFile(configPath, JSON.stringify({ bootstrapped: true }))
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({ ok: false, reason: "invalid" })
  })

  it("returns ok with derived paths for a valid bootstrapped config", async () => {
    await writeFile(
      configPath,
      JSON.stringify({
        person: "Nana",
        projects: ["example-project"],
        output_repo: "/Users/nanaosei/plh-ops/reports",
        timezone: "Asia/Tokyo",
        lookback_days: 3,
        bootstrapped: true,
      })
    )
    const result = await readDailyTeamLogConfig(configPath)
    expect(result).toEqual({
      ok: true,
      config: {
        person: "Nana",
        outputRepo: "/Users/nanaosei/plh-ops/reports",
        clone: "/Users/nanaosei/plh-ops",
        gatherPath: "/Users/nanaosei/plh-ops/workflow/daily-team-log/gather.py",
        skillMdPath: "/Users/nanaosei/plh-ops/workflow/daily-team-log/SKILL.md",
      },
    })
  })
})
