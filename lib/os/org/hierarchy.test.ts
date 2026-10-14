import { describe, it, expect } from "vitest"
import { buildHierarchy, flattenNodes } from "./hierarchy"
import { CANONICAL_DEPARTMENTS, CANONICAL_AGENTS } from "@/lib/os/brain/canonical"

describe("Org Hierarchy Math", () => {
  it("builds clean department hierarchy from canonical agents", () => {
    const tree = buildHierarchy(
      CANONICAL_DEPARTMENTS,
      CANONICAL_AGENTS.filter((a) => a.id !== "conductor")
    )

    expect(tree.departments.length).toBe(6)
    expect(tree.totalAgents).toBe(29)
    expect(tree.activeAgents).toBeGreaterThan(0)

    const techDept = tree.departments.find((d) => d.department.id === "dept-tech")
    expect(techDept).toBeDefined()
    expect(techDept?.roots.length).toBeGreaterThan(0)
  })

  it("flattenNodes recursively collects all agent nodes", () => {
    const tree = buildHierarchy(
      CANONICAL_DEPARTMENTS,
      CANONICAL_AGENTS.filter((a) => a.id !== "conductor")
    )
    const allRoots = tree.departments.flatMap((d) => d.roots)
    const flattened = flattenNodes(allRoots)
    expect(flattened.length).toBe(29)
  })
})
