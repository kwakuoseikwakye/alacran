import { describe, it, expect } from "vitest"
import { buildDailyTeamLogSkillMd, DAILY_TEAM_LOG_SETUP_MD, DAILY_TEAM_LOG_MANIFEST } from "./daily-team-log-files"

describe("daily-team-log-files", () => {
  it("DAILY_TEAM_LOG_MANIFEST lists exactly the two verbatim-copy source files", () => {
    expect(DAILY_TEAM_LOG_MANIFEST).toEqual([
      "workflow/daily-team-log/gather.py",
      "workflow/daily-team-log/config.example.json",
    ])
  })

  it("buildDailyTeamLogSkillMd embeds the company name in the output template's business field", () => {
    const md = buildDailyTeamLogSkillMd("Second Co")
    expect(md).toContain("business: Second Co")
  })

  it("buildDailyTeamLogSkillMd contains no PLH- or Owner-specific references", () => {
    const md = buildDailyTeamLogSkillMd("Second Co")
    expect(md).not.toMatch(/PLH/i)
    expect(md).not.toMatch(/Owner/i)
  })

  // Asserted by shape, not by naming the upstream owner/teammates: the
  // original hardcoded a specific GitHub owner/repo to clone and a fixed set
  // of per-person report folders, and the rewritten version detects both at
  // runtime. Naming them here would put back the very identifiers this
  // guard exists to keep out.
  it("DAILY_TEAM_LOG_SETUP_MD carries no upstream identity", () => {
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/github\.com\/[\w.-]+\/[\w.-]+/)
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/reports\/[A-Z][a-z]+/)
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/plh-ops/i)
  })
})
