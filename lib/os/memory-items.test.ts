import { describe, expect, it, vi } from "vitest"
import { INITIAL_COMMIT_MESSAGE } from "@/lib/company-template-manifest"
import { kindOf, listMemoryItems, pickForCard, readMemoryText, thisWeek, weekSummary, type MemoryItem } from "./memory-items"

const REC = "\x1e"
const FLD = "\x1f"
const commit = (date: string, subject: string, files: string[]) => `${REC}${date}${FLD}${subject}${FLD}\n\n${files.join("\n")}\n`
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000)

const PROFILE = "definitions/ontology/company.yaml"
const DECISION = "docs/decisions/2026-09-29-price-by-size.md"
const SESSION = "notes/company/sessions/2026-09-28-supplier-call.md"

const FILES: Record<string, string> = {
  [PROFILE]: "company_summary:\n  domain: A neighbourhood bakery\n",
  [DECISION]:
    "# Price custom cakes by size\n\n## Context\nCustomers ask for quotes.\n\n## Decision\nWe price custom cakes by size, not by decoration.\n\n## Consequences\nQuotes are faster.\n",
  [SESSION]: "# Supplier call\n\nThe flour supplier moves delivery to Tuesdays.\n",
}
const readFn = async (abs: string) => {
  const rel = abs.replace("/co/", "")
  if (!(rel in FILES)) throw new Error("ENOENT")
  return FILES[rel]
}

// args = ["-C", root, "-c", "core.quotepath=false", <subcommand>, ...]
function fakeGit(opts: { log: string; dirty?: string[]; show?: Record<string, string>; fail?: boolean }) {
  return vi.fn(async (_command: string, args: string[]) => {
    if (opts.fail) throw new Error("not a git repository")
    const sub = args[4]
    if (sub === "log") return { stdout: opts.log, stderr: "" }
    if (sub === "diff") return { stdout: (opts.dirty ?? []).join("\n"), stderr: "" }
    if (sub === "show") {
      const rel = args[5].replace("HEAD:./", "")
      if (!opts.show || !(rel in opts.show)) throw new Error("bad object")
      return { stdout: opts.show[rel], stderr: "" }
    }
    throw new Error(`unexpected git ${sub}`)
  })
}

describe("kindOf", () => {
  it("names the kind from the path and ignores everything that is not memory", () => {
    expect(kindOf(PROFILE)).toBe("fact")
    expect(kindOf("definitions/pricing/plans.yml")).toBe("fact")
    expect(kindOf(DECISION)).toBe("decision")
    expect(kindOf(SESSION)).toBe("note")
    expect(kindOf("notes/data.csv")).toBeNull()
    expect(kindOf("records/leads.yaml")).toBeNull()
  })
})

describe("readMemoryText", () => {
  it("says the company profile in the profile's own words", () => {
    expect(readMemoryText(PROFILE, "fact", FILES[PROFILE])).toEqual({
      title: "Your company profile",
      statement: "Your business: A neighbourhood bakery",
    })
  })

  it("takes a decision's statement from its Decision section", () => {
    expect(readMemoryText(DECISION, "decision", FILES[DECISION])).toEqual({
      title: "Price custom cakes by size",
      statement: "We price custom cakes by size, not by decoration.",
    })
  })

  it("falls back to the first paragraph when a decision has no Decision heading", () => {
    expect(readMemoryText("docs/decisions/2026-09-01-x.md", "decision", "# Use weekly invoices\n\nWe invoice every Friday.\n").statement).toBe(
      "We invoice every Friday."
    )
  })

  it("ignores YAML front matter", () => {
    expect(readMemoryText("notes/a.md", "note", "---\ntags: [a]\n---\n# Supplier call\n\nBody text.").title).toBe("Supplier call")
  })

  it("names a note without a heading from its file name and joins its lines", () => {
    expect(readMemoryText("notes/2026-09-20-quick-idea.md", "note", "just words\nmore words")).toEqual({
      title: "Quick idea",
      statement: "just words more words",
    })
  })

  it("does not fail on an empty file", () => {
    expect(readMemoryText("notes/2026-09-20-empty.md", "note", "")).toEqual({ title: "Empty", statement: "" })
  })

  it("names another definition from its file, with no statement", () => {
    expect(readMemoryText("definitions/pricing/price-list.yaml", "fact", "a: 1")).toEqual({ title: "Price list", statement: "" })
  })

  it("strips markdown marks and clips a long statement to 140 characters", () => {
    expect(readMemoryText("notes/a.md", "note", "# T\n\n**Bold** and `code`.").statement).toBe("Bold and code.")
    const long = readMemoryText("notes/a.md", "note", `# T\n\n${"word ".repeat(60)}`).statement
    expect(long).toHaveLength(140)
    expect(long.endsWith("…")).toBe(true)
  })
})

describe("listMemoryItems", () => {
  const LOG =
    commit("2026-09-30T10:00:00+00:00", "Run /orientation", [SESSION, PROFILE]) +
    commit("2026-09-29T10:00:00+00:00", "docs", [DECISION, "notes/gone.md"]) +
    commit("2026-09-01T10:00:00+00:00", INITIAL_COMMIT_MESSAGE, [PROFILE, "notes/starter.md"]) +
    commit("2026-08-01T10:00:00+00:00", "edit", [SESSION])

  it("lists newest first, keeps the latest change per file, and skips the scaffold and deleted files", async () => {
    const items = await listMemoryItems("/co", { execFn: fakeGit({ log: LOG }), readFn })
    expect(items.map((i) => i.path)).toEqual([SESSION, PROFILE, DECISION])
    expect(items[0]).toEqual({
      path: SESSION,
      kind: "note",
      title: "Supplier call",
      statement: "The flour supplier moves delivery to Tuesdays.",
      changedAt: sec("2026-09-30T10:00:00Z"),
    })
    expect(items[2].kind).toBe("decision")
  })

  it("shows the approved text of a committed file that has a pending edit", async () => {
    const execFn = fakeGit({
      log: commit("2026-09-30T10:00:00+00:00", "x", [PROFILE]),
      dirty: [PROFILE],
      show: { [PROFILE]: "company_summary:\n  domain: The approved bakery\n" },
    })
    const draft = async () => "company_summary:\n  domain: A draft bakery\n"
    const [item] = await listMemoryItems("/co", { execFn, readFn: draft })
    expect(item.statement).toBe("Your business: The approved bakery")
  })

  it("says nothing rather than failing when git cannot answer", async () => {
    expect(await listMemoryItems("/co", { execFn: fakeGit({ log: "", fail: true }), readFn })).toEqual([])
  })

  it("survives an accented file name and tells git not to quote it", async () => {
    const path = "notes/2026-09-27-café-call.md"
    const execFn = fakeGit({ log: commit("2026-09-30T10:00:00+00:00", "x", [path]) })
    const items = await listMemoryItems("/co", { execFn, readFn: async () => "# Café call\n\nOrder from Kumasi." })
    expect(items[0]).toMatchObject({ path, title: "Café call" })
    expect(execFn.mock.calls[0][1]).toContain("core.quotepath=false")
  })

  it("asks git only about memory paths, read-only, with the limit", async () => {
    const execFn = fakeGit({ log: "" })
    await listMemoryItems("/co", { execFn, readFn, limit: 5 })
    const args = execFn.mock.calls[0][1] as string[]
    expect(execFn.mock.calls[0][0]).toBe("git")
    expect(args.slice(0, 4)).toEqual(["-C", "/co", "-c", "core.quotepath=false"])
    expect(args[4]).toBe("log")
    expect(args).toContain("-n5")
    expect(args.slice(args.indexOf("--") + 1)).toEqual(["definitions", "notes", "docs/decisions"])
  })

  it("skips a change whose date git printed unreadably", async () => {
    const execFn = fakeGit({ log: commit("not a date", "x", [SESSION]) })
    expect(await listMemoryItems("/co", { execFn, readFn })).toEqual([])
  })
})

const item = (over: Partial<MemoryItem>): MemoryItem => ({ path: "notes/a.md", kind: "note", title: "A", statement: "", changedAt: 0, ...over })
const NOW = new Date("2026-09-30T12:00:00Z")
const nowSec = NOW.getTime() / 1000

describe("thisWeek", () => {
  it("counts a rolling seven days, exactly seven included, future included", () => {
    const items = [
      item({ path: "a", changedAt: nowSec - 7 * 86400 }),
      item({ path: "b", changedAt: nowSec - 7 * 86400 - 1 }),
      item({ path: "c", changedAt: nowSec + 3600 }),
    ]
    expect(thisWeek(items, NOW).map((i) => i.path)).toEqual(["a", "c"])
  })
})

describe("pickForCard", () => {
  it("prefers a fact, then a decision, then the newest notes, so notes cannot crowd a decision out", () => {
    const week = [
      item({ path: "n1", kind: "note", changedAt: 300 }),
      item({ path: "n2", kind: "note", changedAt: 200 }),
      item({ path: "d", kind: "decision", changedAt: 100 }),
      item({ path: "f", kind: "fact", changedAt: 50 }),
    ]
    expect(pickForCard(week).map((i) => i.path)).toEqual(["f", "d", "n1"])
  })
})

describe("weekSummary", () => {
  it("counts by kind in a fixed order and leaves out zeros", () => {
    expect(weekSummary([])).toBe("")
    expect(weekSummary([item({ kind: "note" }), item({ kind: "decision" }), item({ kind: "note" })])).toBe("1 decision, 2 notes")
    expect(weekSummary([item({ kind: "decision" }), item({ kind: "fact" })])).toBe("1 fact, 1 decision")
  })
})
