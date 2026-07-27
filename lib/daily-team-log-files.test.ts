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

  it("DAILY_TEAM_LOG_SETUP_MD contains no plh-ops-specific references", () => {
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/example-user/i)
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/plh-ops/i)
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/Teammate1|Teammate2|Nana/)
  })
})
