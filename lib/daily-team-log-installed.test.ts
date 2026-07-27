import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { dailyTeamLogInstalled } from "./daily-team-log-installed"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "daily-team-log-installed-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("dailyTeamLogInstalled", () => {
  it("returns false when .claude/skills/daily-team-log/gather.py is missing", async () => {
    expect(await dailyTeamLogInstalled(root)).toBe(false)
  })

  it("returns true when .claude/skills/daily-team-log/gather.py exists", async () => {
    const skillDir = path.join(root, ".claude", "skills", "daily-team-log")
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, "gather.py"), "# gather.py\n")
    expect(await dailyTeamLogInstalled(root)).toBe(true)
  })

  it("returns false when the .claude directory doesn't exist at all", async () => {
    expect(await dailyTeamLogInstalled(path.join(root, "does-not-exist"))).toBe(false)
  })
})
