import { describe, it, expect } from "vitest"
import { parseProposedFacts, sourcedChanges, unsourcedChanges, removedLines, isBrokenYaml } from "./fact-changes"

const note = (section: string) => `# Call\n\n**What we worked on**: pricing.\n\n${section}\n`

describe("parseProposedFacts", () => {
  it("reads each line into a row", () => {
    const r = parseProposedFacts(note(`## Proposed fact changes
- fact | company_summary.pricing | fixed-scope projects | was: hourly | "We quote per project now."
- decision | Minimum project length | Stop taking projects under 2 weeks | was: none | "Shorter isn't worth it."
- unconfirmed | customer_segment | hospitality groups | was: local cafés | "Maybe hotels too."`))
    expect(r.state).toBe("ok")
    expect(r.state === "ok" && r.facts.map((f) => [f.kind, f.target, f.value, f.was, f.quote])).toEqual([
      ["fact", "company_summary.pricing", "fixed-scope projects", "hourly", "We quote per project now."],
      ["decision", "Minimum project length", "Stop taking projects under 2 weeks", "none", "Shorter isn't worth it."],
      ["unconfirmed", "customer_segment", "hospitality groups", "local cafés", "Maybe hotels too."],
    ])
    expect(r.state === "ok" && r.facts[0].line).toBe(`- fact | company_summary.pricing | fixed-scope projects | was: hourly | "We quote per project now."`)
  })
  it("is none when the section is absent or empty", () => {
    expect(parseProposedFacts(note("")).state).toBe("none")
    expect(parseProposedFacts(note("## Proposed fact changes\n")).state).toBe("none")
  })
  it("is unreadable when any line breaks the format, never a partial guess", () => {
    expect(parseProposedFacts(note(`## Proposed fact changes
- fact | a | b | was: c | "q"
- something the agent improvised`)).state).toBe("unreadable")
    expect(parseProposedFacts(note(`## Proposed fact changes\n- opinion | a | b | was: c | "q"`)).state).toBe("unreadable")
  })
  it("stops at the next heading", () => {
    const r = parseProposedFacts(`## Proposed fact changes\n- fact | a | b | was: c | "q"\n\n## Later\n- not a fact`)
    expect(r.state === "ok" && r.facts).toHaveLength(1)
  })
})

describe("sourcedChanges", () => {
  it("pairs each sourced new line with the old value of the same key", () => {
    expect(sourcedChanges("pricing: hourly\nname: Acme\n",
      "pricing: fixed-scope projects  # source: notes/company/sessions/a.md, 2026-10-14\nname: Acme\n"))
      .toEqual([{ field: "pricing", was: "hourly", now: "fixed-scope projects", source: "notes/company/sessions/a.md, 2026-10-14" }])
  })
  it("reports a new key with was null", () => {
    expect(sourcedChanges("", "segment: hotels  # source: notes/company/sessions/a.md, 2026-10-14\n")[0].was).toBeNull()
  })
  it("ignores changed lines without a source", () => {
    expect(sourcedChanges("a: 1\n", "a: 2\n")).toEqual([])
  })
})

describe("isBrokenYaml", () => {
  it("is true only for text the yaml parser rejects", () => {
    expect(isBrokenYaml("a: 1\n")).toBe(false)
    expect(isBrokenYaml("a: [1, 2\n")).toBe(true)
  })
})

describe("parseProposedFacts edge cases", () => {
  it("is unreadable when a quote contains the field separator", () => {
    expect(parseProposedFacts(note(`## Proposed fact changes\n- fact | a | b | was: c | "x | y"`)).state).toBe("unreadable")
  })
  it("does not end at a ### subheading, so the rows after it are not silently dropped", () => {
    const r = parseProposedFacts(`## Proposed fact changes\n- fact | a | b | was: c | "q"\n### Sub\n- fact | d | e | was: f | "r"`)
    expect(r.state).toBe("unreadable")
  })
  it("is unreadable when was: has no value", () => {
    expect(parseProposedFacts(note(`## Proposed fact changes\n- fact | a | b | was: | "q"`)).state).toBe("unreadable")
  })
})

describe("sourcedChanges with real company.yaml shapes", () => {
  const before = [
    "stakeholders:",
    "  - name: qa-architect",
    "    owns: old-a",
    "  - name: reviewer",
    "    owns: old-b",
    "",
  ].join("\n")

  it("pairs a duplicate key with the old value in the same item, and names the item in field", () => {
    const after = before.replace("owns: old-b", "owns: new-b  # source: notes/company/sessions/a.md, 2026-10-14")
    expect(sourcedChanges(before, after)).toEqual([{
      field: "stakeholders › reviewer › owns", was: "old-b", now: "new-b", source: "notes/company/sessions/a.md, 2026-10-14",
    }])
  })
  it("reports a brand-new list item with was null", () => {
    const after = before + "  - name: hire\n    owns: x  # source: s\n"
    expect(sourcedChanges(before, after)).toEqual([{ field: "stakeholders › hire › owns", was: null, now: "x", source: "s" }])
  })
  it("reports a scalar list item with a source", () => {
    const old = "tags:\n  - alpha\n"
    expect(sourcedChanges(old, "tags:\n  - beta  # source: s\n")).toEqual([
      { field: "tags (list item)", was: "alpha", now: "beta", source: "s" },
    ])
  })
  it("reports a parent key with an empty value as (changed below)", () => {
    const old = "pricing:\n  fixed: no\n"
    expect(sourcedChanges(old, "pricing:  # source: s\n  fixed: yes\n")).toEqual([
      { field: "pricing", was: "(changed below)", now: "(changed below)", source: "s" },
    ])
  })
  it("treats CRLF input exactly like LF", () => {
    const after = before.replace("owns: old-b", "owns: new-b  # source: s")
    const lf = sourcedChanges(before, after)
    expect(lf).toHaveLength(1)
    expect(sourcedChanges(before.replace(/\n/g, "\r\n"), after.replace(/\n/g, "\r\n"))).toEqual(lf)
  })
  it("ignores a # that is not a # source: comment", () => {
    expect(sourcedChanges("", "rate: 5 # per hour\n")).toEqual([])
  })
})

describe("unsourcedChanges", () => {
  it("lists changed lines with no source, and ignores unchanged, blank and comment-only lines", () => {
    const old = "a: 1\nb: 2\n"
    const after = "a: 2\nb: 2\n\n# a note\nc: 3  # source: s\nd: 4\n"
    expect(unsourcedChanges(old, after)).toEqual(["a: 2", "d: 4"])
  })
})

describe("removedLines", () => {
  it("lists pure deletions, not replaced values or blank lines", () => {
    const old = "a: 1\nb: 2\n\nc: 3\n"
    expect(removedLines(old, "a: 9\nc: 3\n")).toEqual(["b: 2"])
  })
  it("is CRLF-safe and empty when nothing is removed", () => {
    expect(removedLines("a: 1\r\nb: 2\r\n", "a: 1\r\n")).toEqual(["b: 2"])
    expect(removedLines("a: 1\n", "a: 1\nb: 2\n")).toEqual([])
  })
})
