import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect } from "vitest"
import { GraphDirectory } from "./graph-directory"
import { KnowledgeGraph } from "./knowledge-graph"
import { demoMemoryGraph } from "@/lib/os/brain/memory-core"
import {
  CANONICAL_DEPARTMENTS,
  CANONICAL_AGENTS,
  CANONICAL_PEOPLE,
  CANONICAL_SOP_TASKS,
  CANONICAL_RUNS,
} from "@/lib/os/brain/canonical"
import { buildKnowledgeGraph } from "@/lib/os/brain/knowledge-graph"

describe("KnowledgeGraph & GraphDirectory", () => {
  it("renders GraphDirectory in collapsed and expanded states", () => {
    const collapsed = renderToStaticMarkup(
      React.createElement(GraphDirectory, {
        groups: [],
        onPick: () => {},
        collapsed: true,
        onToggleCollapse: () => {},
      })
    )
    expect(collapsed).toContain("Directory")

    const expanded = renderToStaticMarkup(
      React.createElement(GraphDirectory, {
        groups: [
          {
            kind: "employee",
            title: "AI agents",
            rows: [{ id: "emp:sales-agent", label: "Sales Agent", sub: "Sales" }],
          },
        ],
        onPick: () => {},
        collapsed: false,
      })
    )
    expect(expanded).toContain("AI agents")
    expect(expanded).toContain("Sales Agent")
  })

  it("builds and instantiates KnowledgeGraph with canonical data", () => {
    const kg = buildKnowledgeGraph(
      CANONICAL_AGENTS,
      CANONICAL_DEPARTMENTS,
      CANONICAL_PEOPLE,
      CANONICAL_SOP_TASKS
    )
    expect(kg.nodes.length).toBeGreaterThan(10)
    expect(kg.edges.length).toBeGreaterThan(10)

    expect(typeof KnowledgeGraph).toBe("function")
    const html = renderToStaticMarkup(
      React.createElement(KnowledgeGraph, {
        graph: kg,
        agents: CANONICAL_AGENTS,
        departments: CANONICAL_DEPARTMENTS,
        people: CANONICAL_PEOPLE,
        tasks: CANONICAL_SOP_TASKS,
        memory: demoMemoryGraph(),
        clients: [],
        runsByAgent: CANONICAL_RUNS,
      })
    )
    expect(html).toBeDefined()
    expect(html.length).toBeGreaterThan(100)
  })
})
