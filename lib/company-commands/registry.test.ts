import { describe, it, expect } from "vitest"
import { COMPANY_COMMANDS, getCompanyCommand } from "./registry"

describe("COMPANY_COMMANDS registry", () => {
  it("has exactly the 5 in-scope commands", () => {
    expect(COMPANY_COMMANDS.map((c) => c.id).sort()).toEqual(
      ["decision", "define-company", "digest", "handoff", "retro"].sort()
    )
  })

  it("every command's required fields are all present in its own buildPrompt output", () => {
    for (const command of COMPANY_COMMANDS) {
      const values: Record<string, string> = {}
      for (const field of command.fields) {
        values[field.key] = field.required ? `TEST_VALUE_${field.key}` : ""
      }
      const prompt = command.buildPrompt(values, "2026-07-23", "TEST_PREFETCH")
      for (const field of command.fields.filter((f) => f.required)) {
        expect(prompt).toContain(`TEST_VALUE_${field.key}`)
      }
    }
  })

  it("only handoff declares needsPrefetch", () => {
    const withPrefetch = COMPANY_COMMANDS.filter((c) => c.needsPrefetch).map((c) => c.id)
    expect(withPrefetch).toEqual(["handoff"])
  })

  it("getCompanyCommand returns undefined for an unknown id", () => {
    expect(getCompanyCommand("create-epic")).toBeUndefined()
    expect(getCompanyCommand("nonexistent")).toBeUndefined()
  })

  it("getCompanyCommand returns the matching entry for a known id", () => {
    expect(getCompanyCommand("digest")?.outputPath).toBe("notes/company/digests")
  })
})
