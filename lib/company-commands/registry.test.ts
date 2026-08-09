import { describe, it, expect } from "vitest"
import { COMPANY_COMMANDS, getCompanyCommand } from "./registry"

describe("COMPANY_COMMANDS registry", () => {
  it("has exactly the 9 in-scope commands", () => {
    expect(COMPANY_COMMANDS.map((c) => c.id).sort()).toEqual(
      [
        "check-inbox",
        "check-notion",
        "decision",
        "define-company",
        "digest",
        "handoff",
        "retro",
        "triage-email",
        "triage-issue",
      ].sort()
    )
  })

  it("every command's required fields are all present in its own buildPrompt output, except fields a prefetchKind consumes before buildPrompt ever runs", () => {
    // triage-issue's `issue` field is parsed by prefetch (parseIssueRef) before buildPrompt is
    // called — the prefetched issue text is what reaches the prompt template, not the raw field
    // value, so it has nothing to assert here the way a directly-templated field does.
    const CONSUMED_BY_PREFETCH: Record<string, string[]> = { "triage-issue": ["issue"] }
    for (const command of COMPANY_COMMANDS) {
      const values: Record<string, string> = {}
      for (const field of command.fields) {
        values[field.key] = field.required ? `TEST_VALUE_${field.key}` : ""
      }
      const prompt = command.buildPrompt(values, "2026-07-23", "TEST_PREFETCH", ["auto"])
      const skip = CONSUMED_BY_PREFETCH[command.id] ?? []
      for (const field of command.fields.filter((f) => f.required && !skip.includes(f.key))) {
        expect(prompt).toContain(`TEST_VALUE_${field.key}`)
      }
    }
  })

  it("only handoff, check-notion, triage-email, and triage-issue declare a prefetchKind", () => {
    const withPrefetch = COMPANY_COMMANDS.filter((c) => c.prefetchKind !== undefined).map((c) => c.id)
    expect(withPrefetch).toEqual(["handoff", "check-notion", "triage-email", "triage-issue"])
  })

  it("only check-inbox declares bashPatterns; unassigned it resolves to -a auto, assigned it resolves per account", () => {
    const withBash = COMPANY_COMMANDS.filter((c) => c.bashPatterns).map((c) => c.id)
    expect(withBash).toEqual(["check-inbox"])
    const bashPatterns = getCompanyCommand("check-inbox")?.bashPatterns
    expect(typeof bashPatterns).toBe("function")
    const resolve = bashPatterns as (accounts: string[]) => string[]
    expect(resolve(["auto"])).toEqual(["gog -a auto gmail search*", "gog -a auto gmail get*"])
    expect(resolve(["a@x.com", "b@x.com"])).toEqual([
      "gog -a a@x.com gmail search*",
      "gog -a a@x.com gmail get*",
      "gog -a b@x.com gmail search*",
      "gog -a b@x.com gmail get*",
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
    const prompt = getCompanyCommand("check-inbox")!.buildPrompt({}, "2026-07-28", "", ["auto"])
    expect(prompt).toContain("gog -a <account> gmail search")
    expect(prompt).toContain("gog -a <account> gmail get")
    expect(prompt).toMatch(/read-only/i)
    // The prompt must name the mutating commands as forbidden (not merely omit them);
    // the hard read-only guarantee is the bashPatterns allowlist, tested separately.
    expect(prompt).toMatch(/Do NOT run gog gmail send, gog gmail messages modify/)
  })

  it("check-notion is a zero-field new-file-in-dir command writing to notes/company/notion-checks, with the check-notion prefetch kind", () => {
    const cmd = getCompanyCommand("check-notion")
    expect(cmd?.fields).toEqual([])
    expect(cmd?.outputKind).toBe("new-file-in-dir")
    expect(cmd?.outputPath).toBe("notes/company/notion-checks")
    expect(cmd?.prefetchKind).toBe("check-notion")
    expect(cmd?.bashPatterns).toBeUndefined()
  })

  it("check-notion's buildPrompt embeds the prefetched text verbatim and states it never writes to Notion", () => {
    const prompt = getCompanyCommand("check-notion")!.buildPrompt({}, "2026-08-09", "TEST_PREFETCH_TEXT", ["auto"])
    expect(prompt).toContain("TEST_PREFETCH_TEXT")
    expect(prompt).toMatch(/do not write to notion/i)
  })

  it("both triage commands' prompts carry the untrusted-content framing, naming the nonced fence", () => {
    // The spec names this framing the slice's primary injection defence, and it is
    // the one layer that applies on every executor (the no-Bash and scoped-Edit
    // layers are Claude Code-specific). Asserted on short distinctive phrases, not
    // the whole paragraph, so rewording the prose stays green but deleting the
    // defence does not.
    for (const id of ["triage-email", "triage-issue"]) {
      const prompt = getCompanyCommand(id)!.buildPrompt(
        { messageId: "", issue: "owner/repo#1" },
        "2026-08-04",
        "TEST_PREFETCH",
        ["auto"]
      )
      expect(prompt).toMatch(/UNTRUSTED:<nonce>/)
      expect(prompt).toMatch(/not instructions for you/i)
      expect(prompt).toMatch(/injection attempt/i)
    }
  })

  it("getCompanyCommand returns undefined for an unknown id", () => {
    expect(getCompanyCommand("create-epic")).toBeUndefined()
    expect(getCompanyCommand("nonexistent")).toBeUndefined()
  })

  it("getCompanyCommand returns the matching entry for a known id", () => {
    expect(getCompanyCommand("digest")?.outputPath).toBe("notes/company/digests")
  })
})
