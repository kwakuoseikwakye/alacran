import { describe, it, expect } from "vitest"
import { RESEARCH_PROSPECTS_COMMAND } from "./research-prospects-command"

describe("RESEARCH_PROSPECTS_COMMAND", () => {
  it("has correct command metadata and configuration", () => {
    expect(RESEARCH_PROSPECTS_COMMAND.id).toBe("research-prospects")
    expect(RESEARCH_PROSPECTS_COMMAND.outputPath).toBe("notes/funnel/prospects")
    expect(RESEARCH_PROSPECTS_COMMAND.untrustedInput).toBe(true)
    expect(RESEARCH_PROSPECTS_COMMAND.fields).toHaveLength(3)
  })

  it("builds prompt with target query, count, and ICP guidance", () => {
    const prompt = RESEARCH_PROSPECTS_COMMAND.buildPrompt!(
      { target: "AI agencies in London", count: "3", criteria: "Focus on founders" },
      "2026-09-27",
      ""
    )

    expect(prompt).toContain("Target: AI agencies in London")
    expect(prompt).toContain("Focus on founders")
    expect(prompt).toContain("Write exactly 3 prospects")
    expect(prompt).toContain("definitions/ontology/company.yaml")
    expect(prompt).toContain("notes/funnel/prospects/")
    expect(prompt).toContain("Rule: Stop at the gate.")
  })

  it("clamps count between 1 and 5", () => {
    const promptTooHigh = RESEARCH_PROSPECTS_COMMAND.buildPrompt!({ target: "test", count: "10" }, "2026-09-27", "")
    expect(promptTooHigh).toContain("Write exactly 5 prospects")

    const promptNegative = RESEARCH_PROSPECTS_COMMAND.buildPrompt!({ target: "test", count: "-2" }, "2026-09-27", "")
    expect(promptNegative).toContain("Write exactly 1 prospect")
  })
})
