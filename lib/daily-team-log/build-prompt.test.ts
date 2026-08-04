import { describe, it, expect } from "vitest"
import { buildDailyTeamLogPrompt } from "./build-prompt"
import type { DailyTeamLogConfig } from "./read-config"

const CONFIG: DailyTeamLogConfig = {
  person: "Nana",
  outputRepo: "/Users/example/plh-ops/reports",
  clone: "/Users/example/plh-ops",
  gatherPath: "/Users/example/plh-ops/workflow/daily-team-log/gather.py",
  skillMdPath: "/Users/example/plh-ops/workflow/daily-team-log/SKILL.md",
}

describe("buildDailyTeamLogPrompt", () => {
  it("substitutes every config field", () => {
    const prompt = buildDailyTeamLogPrompt(CONFIG)
    expect(prompt).toContain("git -C /Users/example/plh-ops pull")
    expect(prompt).toContain("python3 /Users/example/plh-ops/workflow/daily-team-log/gather.py pending")
    expect(prompt).toContain("Read /Users/example/plh-ops/workflow/daily-team-log/SKILL.md")
    expect(prompt).toContain("/Users/example/plh-ops/reports/Nana/<DATE>.md")
    expect(prompt).toContain('git -C /Users/example/plh-ops/reports add Nana/<DATE>.md')
    expect(prompt).toContain('auto(daily-log): <DATE> Nana')
  })

  it("leaves <DATE> as a literal token, not substituted", () => {
    const prompt = buildDailyTeamLogPrompt(CONFIG)
    expect(prompt).toContain("<DATE>")
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}\.md/)
  })

  it("never uses an em dash (repo rule the prompt itself states)", () => {
    const prompt = buildDailyTeamLogPrompt(CONFIG)
    expect(prompt).not.toContain("—")
  })
})
