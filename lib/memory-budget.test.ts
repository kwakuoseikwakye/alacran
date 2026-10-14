import { describe, expect, it } from "vitest"
import {
  gatherSingleCompanyContext,
  latestHandoffEntry,
  findRelevantNotes,
  stalenessNote,
  withinBudget,
  MEMORY_BUDGET_CHARS,
} from "./ask-company-impl"

/** An in-memory company folder. */
function fakeFs(files: Record<string, string>) {
  const readFile = async (p: string) => {
    if (p in files) return files[p]
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
  }
  const readDir = async (dir: string) =>
    Object.keys(files)
      .filter((f) => f.startsWith(dir + "/") && !f.slice(dir.length + 1).includes("/"))
      .map((f) => f.slice(dir.length + 1))
  return { readFile, readDir }
}

describe("the memory a question carries", () => {
  it("sends only the latest HANDOFF entry, not the whole log", () => {
    const log = "# HANDOFF\n\n## 2026-01-01\nold stuff\n\n## 2026-09-20\nwhat we did last"
    expect(latestHandoffEntry(log)).toBe("## 2026-09-20\nwhat we did last")
  })

  it("stays under the budget however large the files grow", async () => {
    const huge = "## 2026-09-20\n" + "x".repeat(200_000)
    const { readFile, readDir } = fakeFs({
      "/co/docs/company-summary.md": "# Acme\n" + "y".repeat(50_000),
      "/co/HANDOFF.md": "# H\n" + huge,
      "/co/notes/company/sessions/2026-09-20-s.md": "z".repeat(50_000),
    })
    const context = await gatherSingleCompanyContext("/co", readFile, readDir, { question: "anything" })
    expect(context.length).toBeLessThanOrEqual(MEMORY_BUDGET_CHARS)
    expect(context).toContain("## docs/company-summary.md")
  })

  it("keeps the highest-priority tiers when the budget runs out", () => {
    const out = withinBudget(
      [
        { priority: 5, text: "old decision " + "d".repeat(900) },
        { priority: 1, text: "company card" },
      ],
      500
    )
    expect(out.startsWith("company card")).toBe(true)
  })

  it("finds the note that matches the question, locally", async () => {
    const { readFile, readDir } = fakeFs({
      "/co/docs/decisions/2026-03-01-pricing.md": "# Retainer pricing\nWe moved clients to a monthly retainer.",
      "/co/docs/decisions/2026-04-01-hiring.md": "# Hiring\nWe hire a second chef in May.",
    })
    const hits = await findRelevantNotes("/co", "What did we decide about the retainer pricing?", readFile, readDir)
    expect(hits[0].path).toBe("docs/decisions/2026-03-01-pricing.md")
    expect(hits.some((h) => h.path.includes("hiring"))).toBe(false)
  })

  it("carries the latest digest, standing in for older sessions", async () => {
    const { readFile, readDir } = fakeFs({
      "/co/notes/company/digests/2026-09-01-digest.md": "old week",
      "/co/notes/company/digests/2026-09-15-digest.md": "This week: two new leads.",
    })
    const context = await gatherSingleCompanyContext("/co", readFile, readDir)
    expect(context).toContain("This week: two new leads.")
    expect(context).not.toContain("old week")
  })

  it("marks a company card that hasn't been updated for months", () => {
    const now = new Date(Date.UTC(2026, 8, 23))
    expect(stalenessNote("updated: 2026-01-10", now)).toMatch(/Last updated \d+ days ago/)
    expect(stalenessNote("updated: 2026-09-10", now)).toBe("")
  })
})
