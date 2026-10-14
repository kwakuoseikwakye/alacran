import { describe, it, expect } from "vitest"
import { buildKnowledgeGraph } from "./knowledge-graph"
import type { Department, SopTask } from "./types"

describe("buildKnowledgeGraph", () => {
  // A new company's value flow still reads "<<TODO: a role id from org.roles>>",
  // so its step has no owner the graph knows. d3-force throws "node not found"
  // on any edge whose end is missing, which took down /brain for every new company.
  it("never draws an edge to a worker that isn't in the graph", () => {
    const departments: Department[] = [{ id: "dept-funnel", name: "Funnel", tagline: "" }]
    const tasks: SopTask[] = [{
      id: "task-flow-0", departmentId: "dept-funnel", title: "Take the order", summary: "",
      steps: [], assigneeKind: "agent", assigneeId: "operator",
    }]

    const { nodes, edges } = buildKnowledgeGraph([], departments, [], tasks)

    const ids = new Set(nodes.map((n) => n.id))
    expect(edges.filter((e) => !ids.has(e.source) || !ids.has(e.target))).toEqual([])
  })
})
