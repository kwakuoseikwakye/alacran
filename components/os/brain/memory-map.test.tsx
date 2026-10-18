import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { MemoryMap } from "./memory-map"
import type { MemoryGraph } from "@/lib/os/brain/memory-graph-types"

const graph: MemoryGraph = {
  nodes: [
    { id: "AGENTS.md", type: "fact", label: "AGENTS.md", path: "AGENTS.md", summary: "How work runs.", state: "always" },
    { id: "yaml:product.bottleneck", type: "fact", label: "Release bottleneck", path: "definitions/ontology/company.yaml", summary: "Unconfirmed.", state: "unsure" },
    { id: "hub:decisions", type: "hub", label: "Decisions", path: "", summary: "", state: "lookup" },
  ],
  edges: [{ source: "AGENTS.md", target: "hub:decisions" }],
  counts: { alwaysFiles: 2, lookupFiles: 143, unsureFacts: 7 },
}
const render = (g: MemoryGraph, initialSelectedId?: string) =>
  renderToStaticMarkup(React.createElement(MemoryMap, { companyId: "acme", graph: g, initialSelectedId }))

describe("MemoryMap", () => {
  it("summarises what the AI always knows, can look up and is unsure about", () => {
    const html = render(graph)
    expect(html).toContain("Always knows")
    expect(html).toContain("Can look up")
    expect(html).toContain("Unsure about")
    expect(html).toContain("2 files")
    expect(html).toContain("143 files")
    expect(html).toContain("7 facts")
  })

  it("offers the five type chips", () => {
    const html = render(graph)
    for (const chip of ["Facts", "Decisions", "Notes", "Sessions", "Skills"]) expect(html).toContain(`>${chip}<`)
  })

  it("gives every button a tooltip", () => {
    const buttons = render(graph).match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b).toMatch(/title="[^"]+"/)
  })

  it("gives the side panel's buttons tooltips, and offers confirm and company.yaml for an unsure fact", () => {
    const html = render(graph, "yaml:product.bottleneck")
    expect(html).toContain("Confirm this fact")
    expect(html).toContain("Open company.yaml")
    expect(html).not.toContain("Open the full note")
    for (const b of html.match(/<button[^>]*>/g) ?? []) expect(b).toMatch(/title="[^"]+"/)
  })

  it("titles linked-node buttons and hides confirm for a known fact", () => {
    const html = render(graph, "AGENTS.md")
    expect(html).toContain("Open the full note")
    expect(html).not.toContain("Confirm this fact")
    expect(html).toContain('title="Show Decisions on the map"')
    for (const b of html.match(/<button[^>]*>/g) ?? []) expect(b).toMatch(/title="[^"]+"/)
  })

  it("says nothing is saved instead of drawing an empty canvas", () => {
    const html = render({ nodes: [], edges: [], counts: { alwaysFiles: 0, lookupFiles: 0, unsureFacts: 0 } })
    expect(html).toContain("Nothing saved yet.")
    expect(html).not.toContain("<svg")
  })
})
