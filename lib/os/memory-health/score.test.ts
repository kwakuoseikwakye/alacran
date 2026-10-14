import { describe, it, expect } from "vitest"
import { scoreMemoryHealth } from "./score"

const s = (n: number) => Array.from({ length: n }, () => ({}))
const none = { state: "not-tracked" } as const
const tracked = (sourced: number, unsourced: number) => ({ state: "tracked", sourced, unsourced }) as const

describe("scoreMemoryHealth", () => {
  it("is 100 when nothing needs a look", () => {
    expect(scoreMemoryHealth({ stale: [], unfinished: [], sources: none })).toBe(100)
    expect(scoreMemoryHealth({ stale: [], unfinished: [], sources: tracked(4, 0) })).toBe(100)
  })
  it("takes 10 per stale section, capped at 50", () => {
    expect(scoreMemoryHealth({ stale: s(2), unfinished: [], sources: none })).toBe(80)
    expect(scoreMemoryHealth({ stale: s(9), unfinished: [], sources: none })).toBe(50)
  })
  it("takes 10 per unfinished item, capped at 20", () => {
    expect(scoreMemoryHealth({ stale: [], unfinished: s(1), sources: none })).toBe(90)
    expect(scoreMemoryHealth({ stale: [], unfinished: s(5), sources: none })).toBe(80)
  })
  it("takes up to 30 for the share of unsourced changes, and nothing when sources are not tracked", () => {
    expect(scoreMemoryHealth({ stale: [], unfinished: [], sources: tracked(1, 1) })).toBe(85)
    expect(scoreMemoryHealth({ stale: [], unfinished: [], sources: tracked(0, 4) })).toBe(70)
    expect(scoreMemoryHealth({ stale: [], unfinished: [], sources: tracked(0, 0) })).toBe(100)
    expect(scoreMemoryHealth({ stale: s(3), unfinished: [], sources: none })).toBe(70)
  })
  it("adds up and never goes below zero", () => {
    expect(scoreMemoryHealth({ stale: s(1), unfinished: s(1), sources: tracked(1, 1) })).toBe(100 - 10 - 10 - 15)
    expect(scoreMemoryHealth({ stale: s(50), unfinished: s(50), sources: tracked(0, 9) })).toBe(0)
  })
})
