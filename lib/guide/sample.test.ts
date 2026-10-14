import { describe, it, expect } from "vitest"
import { sampleProposal } from "./sample"
import { summarySentence } from "./proposal-copy"

describe("sampleProposal", () => {
  it("comes out of the real render and diff, with changes of every kind spread across Teams, Commands and Departments", () => {
    const p = sampleProposal()
    expect(p.counts).toEqual({ new: 2, reworded: 1, removed: 1 })
    expect(summarySentence(p.counts)).toBe("4 changes since your AIs last read it: 2 new, 1 reworded, 1 removed")
    expect(p.groups.map((g) => g.section)).toEqual(["teams", "commands", "departments"])
  })

  it("carries both guide bodies, so the technical details have a real diff to show", () => {
    const p = sampleProposal()
    expect(p.oldBody).not.toBe(p.newBody)
    expect(p.newBody).toContain("Marketing")
  })
})
