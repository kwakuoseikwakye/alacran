import { describe, it, expect } from "vitest"
import { buildGraph } from "./graph"
import type { Ontology } from "../ontology/schema"

const ontology: Ontology = {
  customer: {
    segments: [{ id: "smb", name: "Small business owners" }],
    acquisition: [{ channel: "GitHub" }],
  },
  org: {
    roles: [{ id: "lead", name: "Technical Lead" }],
    decisions: [{ decision: "Publishing releases", approver: "lead" }],
  },
  product: {
    offerings: [{ id: "desktop", name: "Desktop app" }],
    value_flow: [{ step: "Install the app", owner: "lead" }],
    bottleneck: "Onboarding",
  },
} as Ontology

describe("buildGraph", () => {
  it("creates one root node the three domains hang off", () => {
    const { nodes, edges } = buildGraph(ontology)
    const root = nodes.find((n) => n.kind === "root")
    expect(root).toBeDefined()
    expect(edges.filter((e) => e.source === root!.id).length).toBeGreaterThanOrEqual(3)
  })

  it("creates a node per segment, role, and offering", () => {
    const { nodes } = buildGraph(ontology)
    expect(nodes.filter((n) => n.kind === "segment")).toHaveLength(1)
    expect(nodes.filter((n) => n.kind === "role")).toHaveLength(1)
    expect(nodes.filter((n) => n.kind === "offering")).toHaveLength(1)
  })

  it("links a value-flow step to the role that owns it", () => {
    const { edges } = buildGraph(ontology)
    expect(edges).toContainEqual({ source: "role:lead", target: "step:0" })
  })

  it("marks a node dim when its owner does not resolve to a role", () => {
    const orphan = {
      ...ontology,
      product: { ...ontology.product, value_flow: [{ step: "Ship", owner: "nobody" }] },
    } as Ontology
    const { nodes } = buildGraph(orphan)
    expect(nodes.find((n) => n.id === "step:0")?.state).toBe("dim")
  })

  it("emits unique node ids", () => {
    const ids = buildGraph(ontology).nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("never emits an edge naming a node that does not exist", () => {
    const { nodes, edges } = buildGraph(ontology)
    const ids = new Set(nodes.map((n) => n.id))
    for (const edge of edges) {
      expect(ids.has(edge.source)).toBe(true)
      expect(ids.has(edge.target)).toBe(true)
    }
  })

  it("handles an ontology with empty collections", () => {
    const empty = {
      customer: { segments: [], acquisition: [] },
      org: { roles: [], decisions: [] },
      product: { offerings: [], value_flow: [] },
    } as Ontology
    const { nodes, edges } = buildGraph(empty)
    expect(nodes.filter((n) => n.kind === "root")).toHaveLength(1)
    expect(edges).toEqual([])
  })
})
