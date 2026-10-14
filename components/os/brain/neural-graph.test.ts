import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect } from "vitest"
import { NeuralGraph } from "./neural-graph"
import {
  CANONICAL_DEPARTMENTS,
  CANONICAL_AGENTS,
  CANONICAL_PEOPLE,
  CANONICAL_SOP_TASKS,
  CANONICAL_RUNS,
} from "@/lib/os/brain/canonical"
import { buildKnowledgeGraph } from "@/lib/os/brain/knowledge-graph"

describe("NeuralGraph horizontal projection", () => {
  it("renders the neural layer projection using canonical data", () => {
    const kg = buildKnowledgeGraph(
      CANONICAL_AGENTS,
      CANONICAL_DEPARTMENTS,
      CANONICAL_PEOPLE,
      CANONICAL_SOP_TASKS
    )

    expect(typeof NeuralGraph).toBe("function")
    const html = renderToStaticMarkup(
      React.createElement(NeuralGraph, {
        graph: kg,
        agents: CANONICAL_AGENTS,
        departments: CANONICAL_DEPARTMENTS,
        people: CANONICAL_PEOPLE,
        tasks: CANONICAL_SOP_TASKS,
        runsByAgent: CANONICAL_RUNS,
      })
    )
    expect(html).toBeDefined()
    expect(html).toContain("svg")
    expect(html).toContain("Tools")
  })
})
