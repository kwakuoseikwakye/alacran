import { describe, it, expect } from "vitest"
import { describeHomeLine, describeMemoryHealth } from "./describe"
import type { MemoryHealth, StaleSection } from "./types"

const stale = (over: Partial<StaleSection> = {}): StaleSection => ({ key: "pricing", label: "Pricing", ageDays: 142, newerNotes: 5, newerDecisions: 2, ...over })
const ok = (over: Partial<Extract<MemoryHealth, { state: "ok" }>> = {}): MemoryHealth => ({
  state: "ok",
  score: 100,
  checkedAt: "2026-10-12T12:00:00.000Z",
  stale: [],
  unfinished: [],
  sources: { state: "tracked", sourced: 2, unsourced: 0 },
  ...over,
})

describe("describeMemoryHealth", () => {
  it("shows nothing when there is no company profile", () => {
    expect(describeMemoryHealth({ state: "none" })).toEqual({ kind: "hidden" })
  })
  it("says it could not check, with no score", () => {
    expect(describeMemoryHealth({ state: "unknown" })).toEqual({ kind: "unknown", text: "Couldn't check memory health." })
  })
  it("collapses to one line when nothing needs a look", () => {
    expect(describeMemoryHealth(ok())).toEqual({
      kind: "clean",
      score: 100,
      text: "Memory health 100 · Nothing out of date that Alacrán can see.",
      note: null,
    })
  })
  it("keeps the strip but adds the sources sentence when sources are not tracked yet (no penalty)", () => {
    const v = describeMemoryHealth(ok({ sources: { state: "not-tracked" } }))
    expect(v).toMatchObject({ kind: "clean", score: 100 })
    expect((v as { note: string }).note).toBe(`Sources aren't tracked yet. New facts get a source automatically when you press "Save what we learned".`)
  })
  it("groups problems with their fix, in plain words", () => {
    const v = describeMemoryHealth(
      ok({
        score: 82,
        stale: [stale(), stale({ key: "stakeholders", label: "Stakeholders", ageDays: 118, newerNotes: 4, newerDecisions: 0 })],
        unfinished: [{ where: "Value flow", line: 20 }],
        sources: { state: "not-tracked" },
      })
    )
    expect(v.kind).toBe("card")
    if (v.kind !== "card") return
    expect(v.score).toBe(82)
    expect(v.pill).toBe("3 things to look at")
    expect(v.groups.map((g) => g.heading)).toEqual(["Might be out of date", "Not finished", "Sources"])
    expect(v.groups[0].rows[0]).toEqual({
      id: "stale-pricing",
      title: "Pricing",
      why: "Last changed 142 days ago. 5 notes and 2 decisions saved since.",
      fix: { kind: "refresh", label: "Check it with refresh" },
    })
    expect(v.groups[0].rows[1].why).toBe("Last changed 118 days ago. 4 notes saved since.")
    expect(v.groups[1].rows[0]).toEqual({
      id: "unfinished-Value flow",
      title: "Value flow",
      why: "Still has a placeholder to fill in.",
      fix: { kind: "finish", label: "Finish company setup" },
    })
    expect(v.groups[2].rows[0]).toMatchObject({ title: "Sources aren't tracked yet", fix: null })
  })
  it("uses singular forms and groups several placeholders in one place", () => {
    const v = describeMemoryHealth(
      ok({ score: 80, stale: [stale({ ageDays: 1, newerNotes: 0, newerDecisions: 1 })], unfinished: [{ where: "Pricing", line: 3 }, { where: "Pricing", line: 9 }] })
    )
    if (v.kind !== "card") throw new Error("expected a card")
    expect(v.groups[0].rows[0].why).toBe("Last changed 1 day ago. 1 decision saved since.")
    expect(v.groups[1].rows).toHaveLength(1)
    expect(v.groups[1].rows[0].why).toBe("Still has 2 placeholders to fill in.")
    expect(v.pill).toBe("2 things to look at")
  })
  it("offers refresh for unsourced fact changes once sources are tracked", () => {
    const v = describeMemoryHealth(ok({ score: 85, sources: { state: "tracked", sourced: 1, unsourced: 1 } }))
    if (v.kind !== "card") throw new Error("expected a card")
    expect(v.pill).toBe("1 thing to look at")
    expect(v.groups).toHaveLength(1)
    expect(v.groups[0].rows[0]).toMatchObject({ why: "1 of 2 recent fact changes have no recorded source.", fix: { kind: "refresh" } })
  })
})

describe("describeHomeLine", () => {
  it("is null unless there is a score below 100 with something to look at", () => {
    expect(describeHomeLine({ state: "none" })).toBeNull()
    expect(describeHomeLine({ state: "unknown" })).toBeNull()
    expect(describeHomeLine(ok())).toBeNull()
  })
  it("names the score and the count", () => {
    expect(describeHomeLine(ok({ score: 82, stale: [stale(), stale({ key: "b", label: "B" })], unfinished: [{ where: "Value flow", line: 1 }] }))).toBe(
      "Memory health 82 · 3 things to look at"
    )
  })
})
