import { describe, it, expect } from "vitest"
import { COMPANY_COMMANDS, getCompanyCommand } from "./registry"

describe("COMPANY_COMMANDS registry", () => {
  it("has exactly the 7 in-scope commands", () => {
    expect(COMPANY_COMMANDS.map((c) => c.id).sort()).toEqual(
      ["check-inbox", "decision", "define-company", "digest", "handoff", "retro", "triage-email"].sort()
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

  it("only handoff and triage-email declare a prefetchKind", () => {
    const withPrefetch = COMPANY_COMMANDS.filter((c) => c.prefetchKind !== undefined).map((c) => c.id)
    expect(withPrefetch).toEqual(["handoff", "triage-email"])
  })

  it("only check-inbox declares bashPatterns, and exactly the two read-only gog commands", () => {
    const withBash = COMPANY_COMMANDS.filter((c) => c.bashPatterns && c.bashPatterns.length > 0).map((c) => c.id)
    expect(withBash).toEqual(["check-inbox"])
    expect(getCompanyCommand("check-inbox")?.bashPatterns).toEqual([
      "gog -a auto gmail search*",
      "gog -a auto gmail get*",
    ])
  })

  it("check-inbox is a zero-field new-file-in-dir command writing to notes/company/email-checks", () => {
    const cmd = getCompanyCommand("check-inbox")
    expect(cmd?.fields).toEqual([])
    expect(cmd?.outputKind).toBe("new-file-in-dir")
    expect(cmd?.outputPath).toBe("notes/company/email-checks")
    expect(cmd?.prefetchKind).toBeUndefined()
  })

  it("check-inbox's buildPrompt is read-only: it names the two gog reads and explicitly forbids send/modify", () => {
    const prompt = getCompanyCommand("check-inbox")!.buildPrompt({}, "2026-07-28", "")
    expect(prompt).toContain("gog -a auto gmail search")
    expect(prompt).toContain("gog -a auto gmail get")
    expect(prompt).toMatch(/read-only/i)
    // The prompt must name the mutating commands as forbidden (not merely omit them);
    // the hard read-only guarantee is the bashPatterns allowlist, tested separately.
    expect(prompt).toMatch(/Do NOT run gog gmail send, gog gmail messages modify/)
  })

  it("getCompanyCommand returns undefined for an unknown id", () => {
    expect(getCompanyCommand("create-epic")).toBeUndefined()
    expect(getCompanyCommand("nonexistent")).toBeUndefined()
  })

  it("getCompanyCommand returns the matching entry for a known id", () => {
    expect(getCompanyCommand("digest")?.outputPath).toBe("notes/company/digests")
  })
})
