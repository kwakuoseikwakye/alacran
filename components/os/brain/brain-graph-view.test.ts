import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect } from "vitest"
import { BrainGraphView } from "./brain-graph-view"
import { BrainDump } from "./brain-dump"
import { buildBrainViewModel } from "@/lib/os/brain/adapter"

describe("BrainGraphView & BrainDump", () => {
  it("buildBrainViewModel constructs full canonical graph and data sets", () => {
    const model = buildBrainViewModel({})
    expect(model.departments.length).toBe(6)
    expect(model.agents.length).toBeGreaterThan(10)
    expect(model.people.length).toBeGreaterThan(0)
    expect(model.tasks.length).toBeGreaterThan(0)
    expect(model.clients.length).toBeGreaterThan(0)
    expect(model.graph.nodes.length).toBeGreaterThan(0)
    expect(model.graph.edges.length).toBeGreaterThan(0)
    expect(model.memory.nodes.length).toBeGreaterThan(0)
  })

  it("renders BrainGraphView mode switches", () => {
    const model = buildBrainViewModel({})
    const html = renderToStaticMarkup(
      React.createElement(BrainGraphView, {
        fill: true,
        ...model,
      })
    )
    expect(html).toContain("Map")
    expect(html).toContain("Flow")
  })

  it("renders BrainDump in compact mode", () => {
    const html = renderToStaticMarkup(
      React.createElement(BrainDump, {
        compact: true,
      })
    )
    expect(html).toContain("Add a note, or drop documents")
    expect(html).toContain("Upload")
    expect(html).toContain("Save")
  })
})
