import { describe, it, expect } from "vitest"
import { lensNodeSet, ALL_LENSES, ENTITY_LENSES } from "./graph-lens"

describe("graph-lens", () => {
  it("has entity, function and action lenses defined", () => {
    expect(ALL_LENSES.length).toBeGreaterThan(15)
    expect(ENTITY_LENSES.map((l) => l.id)).toContain("ent-tools")
  })

  it("filters nodes by lens correctly", () => {
    const nodes = [
      { id: "person:marco", kind: "person" },
      { id: "emp:sales-agent", kind: "employee" },
      { id: "tool:attio", kind: "tool" },
    ]
    const ctx = {
      nodes,
      teamOf: () => "team:dept-sales",
    }

    const toolSet = lensNodeSet("ent-tools", ctx)
    expect(toolSet.has("tool:attio")).toBe(true)
    expect(toolSet.has("person:marco")).toBe(false)

    const peopleSet = lensNodeSet("ent-people", ctx)
    expect(peopleSet.has("person:marco")).toBe(true)
  })
})
