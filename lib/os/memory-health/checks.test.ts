import { describe, it, expect } from "vitest"
import { INITIAL_COMMIT_MESSAGE } from "@/lib/company-template-manifest"
import type { MemoryItem } from "@/lib/os/memory-items"
import { DEFAULT_THRESHOLDS, findSources, findStale, findUnfinished, labelOf, parseBlameTimes, parseSections, parseThresholds } from "./checks"

const DAY = 86400
const NOW = Date.parse("2026-10-12T12:00:00Z") / 1000

describe("parseSections", () => {
  it("splits on top-level keys and ignores metadata keys", () => {
    const text = "created: 2026-01-01\ncompany_summary:\n  domain: bakery\n\n# a comment\npricing:\n  model: by size\nupdated: 2026-09-01\n"
    const sections = parseSections(text)
    expect(sections.map((s) => s.key)).toEqual(["company_summary", "pricing"])
    expect(sections[0]).toEqual({ key: "company_summary", first: 2, last: 5 })
    expect(sections[1]).toEqual({ key: "pricing", first: 6, last: 7 })
  })
  it("copes with CRLF, no trailing newline, only metadata, and indented lookalikes", () => {
    expect(parseSections("a:\r\n  b: 1\r\nc: 2").map((s) => s.key)).toEqual(["a", "c"])
    expect(parseSections("created: 1\nupdated: 2\n")).toEqual([])
    expect(parseSections("")).toEqual([])
    expect(parseSections("pricing:\n  status: draft\n").map((s) => s.key)).toEqual(["pricing"])
  })
})

describe("parseSections with the real meta: shape", () => {
  it("never makes Meta a section", () => {
    const text = 'meta:\n  version: 1\n  updated: "2026-01-01"\n\ncustomer:\n  x: 1\norg:\n  y: 2\nproduct:\n  z: 3\n'
    expect(parseSections(text).map((s) => s.key)).toEqual(["customer", "org", "product"])
  })
})

describe("labelOf", () => {
  it("says a key in plain words", () => {
    expect(labelOf("value_flow")).toBe("Value flow")
    expect(labelOf("company-summary")).toBe("Company summary")
  })
})

describe("parseBlameTimes", () => {
  it("maps each final line to its author-time", () => {
    const sha = "a".repeat(40)
    const sha2 = "b".repeat(40)
    const out = [
      `${sha} 1 1 1`, "author A", "author-time 1000", "summary x", "filename f", "\tcompany_summary:",
      `${sha2} 2 2 1`, "author A", "author-time 2000", "summary y", "filename f", "\t  domain: bakery",
    ].join("\n")
    expect([...parseBlameTimes(out)]).toEqual([[1, 1000], [2, 2000]])
  })
})

describe("findStale", () => {
  const text = "created: 2026-01-01\ncompany_summary:\n  domain: bakery\npricing:\n  model: by size\n"
  let n = 0
  const item = (kind: MemoryItem["kind"], daysAgo: number): MemoryItem => ({ path: `p${n++}`, kind, title: "", statement: "", changedAt: NOW - daysAgo * DAY })
  const times = (summaryDaysAgo: number, pricingDaysAgo: number) =>
    new Map([[1, NOW - 400 * DAY], [2, NOW - summaryDaysAgo * DAY], [3, NOW - summaryDaysAgo * DAY], [4, NOW - pricingDaysAgo * DAY], [5, NOW - pricingDaysAgo * DAY]])
  const base = { text, nowSeconds: NOW, thresholds: DEFAULT_THRESHOLDS }

  it("flags a section at least 90 days old with at least 3 newer notes or decisions, and never the metadata keys", () => {
    const items = [item("note", 60), item("note", 40), item("decision", 20)]
    const out = findStale({ ...base, times: times(10, 150), items })
    expect(out).toEqual([{ key: "pricing", label: "Pricing", ageDays: 150, newerNotes: 2, newerDecisions: 1 }])
  })
  it("does not flag with only 2 newer items, or a recently edited section, or facts as 'newer'", () => {
    expect(findStale({ ...base, times: times(10, 150), items: [item("note", 60), item("decision", 20), item("fact", 10)] })).toEqual([])
    expect(findStale({ ...base, times: times(10, 30), items: [item("note", 5), item("note", 4), item("note", 3)] })).toEqual([])
  })
  it("does not count a note older than the section", () => {
    expect(findStale({ ...base, times: times(10, 150), items: [item("note", 200), item("note", 190), item("note", 180)] })).toEqual([])
  })
  it("never flags a future-dated section (negative age)", () => {
    const items = [item("note", 1), item("note", 1), item("note", 1)]
    expect(findStale({ ...base, times: times(-5, -5), items })).toEqual([])
  })
  it("skips a section with no blame data", () => {
    expect(findStale({ ...base, times: new Map(), items: [item("note", 1), item("note", 1), item("note", 1)] })).toEqual([])
  })
  it("uses the newest non-comment line of a section as its date", () => {
    const t = new Map([[2, NOW - 300 * DAY], [3, NOW - 5 * DAY], [4, NOW - 300 * DAY], [5, NOW - 300 * DAY]])
    const items = [item("note", 100), item("note", 100), item("note", 100)]
    expect(findStale({ ...base, times: t, items }).map((s) => s.key)).toEqual(["pricing"])
  })
})

const REC = "\x1e"
const FLD = "\x1f"
const rec = (subject: string, body: string, patch: string) => `${REC}${"c".repeat(40)}${FLD}${subject}${FLD}${subject}\n\n${body}${FLD}\n${patch}`
const patch = (...added: string[]) => ["diff --git a/f b/f", "--- a/f", "+++ b/f", "@@ -1 +1 @@", ...added.map((l) => `+${l}`)].join("\n")

describe("findSources", () => {
  it("is not-tracked when no fact change carries a source", () => {
    const log = rec("Update pricing", "", patch("  model: by size")) + rec("Describe", "", patch("domain: bakery"))
    expect(findSources(log)).toEqual({ state: "not-tracked" })
  })
  it("counts from the oldest sourced change onward (log is newest first), by line mark or commit line", () => {
    const log =
      rec("Later, no source", "", patch("  model: tiered")) +
      rec("Applied", "Applied facts from: notes/company/sessions/a.md", patch("  tone: warm")) +
      rec("Marked", "", patch("  model: by size  # source: notes/a.md")) +
      rec("Before sources existed", "", patch("domain: bakery"))
    expect(findSources(log)).toEqual({ state: "tracked", sourced: 2, unsourced: 1 })
  })
  it("ignores the template's first commit and changes that only touch metadata or comments", () => {
    const log =
      rec("Bump", "", patch("updated: 2026-09-01")) +
      rec("Comment", "", patch("# a note to self")) +
      rec("Marked", "", patch("  model: by size  # source: notes/a.md")) +
      rec(INITIAL_COMMIT_MESSAGE, "", patch("domain: template"))
    expect(findSources(log)).toEqual({ state: "tracked", sourced: 1, unsourced: 0 })
  })
  it("accepts #source: without a space, like the writeback check", () => {
    expect(findSources(rec("Marked", "", patch("  model: by size  #source: notes/a.md")))).toEqual({ state: "tracked", sourced: 1, unsourced: 0 })
  })
  it("does not treat a bumped indented updated/version line as a fact change", () => {
    const log = rec("Bump", "", patch('  updated: "2026-10-12"', "  version: 2")) + rec("Marked", "", patch("  model: by size  # source: notes/a.md"))
    expect(findSources(log)).toEqual({ state: "tracked", sourced: 1, unsourced: 0 })
    expect(findSources(rec("Bump", "", patch('  updated: "2026-10-12"')))).toEqual({ state: "not-tracked" })
  })
  it("reads an empty log as not-tracked", () => {
    expect(findSources("")).toEqual({ state: "not-tracked" })
  })
})

describe("findUnfinished", () => {
  const profile = "company_summary:\n  domain: <<TODO>>\nvalue_flow:\n  input: ok\n  output: <<TODO>>\n"
  it("labels company profile hits with their section and other files by plain name", () => {
    const grep = ["HEAD:definitions/ontology/company.yaml:2:  domain: <<TODO>>", "HEAD:definitions/ontology/company.yaml:5:  output: <<TODO>>", "HEAD:definitions/brand-voice.md:7:Tone: <<TODO>>"].join("\n")
    expect(findUnfinished(grep, profile)).toEqual([
      { where: "Company summary", line: 2 },
      { where: "Value flow", line: 5 },
      { where: "Brand voice", line: 7 },
    ])
  })
  it("reads empty output as nothing", () => {
    expect(findUnfinished("", profile)).toEqual([])
  })
})

describe("parseThresholds", () => {
  it("defaults when absent, unreadable or malformed", () => {
    expect(parseThresholds(null)).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds("::: not yaml [")).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds("- a\n- b\n")).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds("just a string")).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds("null")).toEqual(DEFAULT_THRESHOLDS)
  })
  it("takes valid integers in range, key by key", () => {
    expect(parseThresholds("stale_after_days: 60\nmin_newer_notes: 5\n")).toEqual({ staleAfterDays: 60, minNewerNotes: 5 })
    expect(parseThresholds("stale_after_days: 60\n")).toEqual({ staleAfterDays: 60, minNewerNotes: 3 })
  })
  it("falls back per key on out-of-range, non-integer or huge values", () => {
    expect(parseThresholds("stale_after_days: 3\nmin_newer_notes: 99\n")).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds("stale_after_days: 12.5\nmin_newer_notes: soon\n")).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds("stale_after_days: 1e12\nmin_newer_notes: 2\n")).toEqual({ staleAfterDays: 90, minNewerNotes: 2 })
  })
})
