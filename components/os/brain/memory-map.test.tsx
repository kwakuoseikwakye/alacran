import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { MemoryMap } from "./memory-map"
import { MemoryNoteView } from "./memory-note-view"
import { buildLinkIndex } from "@/lib/os/brain/memory-links"
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

  it("opens a note in three panes: files by folder, the linked note, and a local map", () => {
    const g: MemoryGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: "docs/decisions/a.md", type: "decision", label: "Price by size", path: "docs/decisions/a.md", summary: "", state: "lookup" },
        { id: "notes/far.md", type: "note", label: "Far away note", path: "notes/far.md", summary: "", state: "lookup" },
        { id: "hub:notes", type: "hub", label: "Notes", path: "", summary: "", state: "lookup" },
      ],
      edges: [...graph.edges, { source: "docs/decisions/a.md", target: "hub:decisions" }, { source: "AGENTS.md", target: "docs/decisions/a.md" }, { source: "notes/far.md", target: "hub:notes" }],
    }
    const html = renderToStaticMarkup(
      React.createElement(MemoryMap, { companyId: "acme", graph: g, initialNote: { id: "AGENTS.md", text: "Start with docs/decisions/a.md <b>" } })
    )
    const files = html.slice(html.indexOf('aria-label="Files"'), html.indexOf("</nav>"))
    expect(files).toContain("Decisions")
    expect(files).toContain("Price by size")
    expect(files).toContain("Far away note")
    expect(html).toMatch(/white-space:pre-wrap/)
    expect(html).toContain("Start with ")
    expect(html).toContain("&lt;b&gt;")
    expect(html).toMatch(/<button[^>]*title="Open Price by size"[^>]*>docs\/decisions\/a\.md<\/button>/)
    expect(html).toContain("Back to the map")
    const local = html.slice(html.indexOf('aria-label="What AGENTS.md links to"'), html.lastIndexOf("</svg>"))
    expect(local).toContain("AGENTS.md")
    expect(local).toContain("Price by size")
    expect(local).toContain("Decisions")
    expect(local).not.toContain("Far away note")
    expect(local).not.toContain("Release bottleneck")
    for (const b of html.match(/<button[^>]*>/g) ?? []) expect(b).toMatch(/title="[^"]+"/)
  })

  it("shows a loading line, then a plain error with the way back, never a blank pane", () => {
    const view = (text: string | null, failed: boolean) =>
      renderToStaticMarkup(
        React.createElement(MemoryNoteView, {
          graph, node: graph.nodes[0], text, failed, index: buildLinkIndex([], [], {}), onOpen: () => {}, onBack: () => {},
        })
      )
    expect(view(null, false)).toContain("Opening the note…")
    const failed = view(null, true)
    expect(failed).toContain("Couldn&#x27;t open this note.")
    expect(failed).toContain("Back to the map")
  })

  it("says nothing is saved instead of drawing an empty canvas", () => {
    const html = render({ nodes: [], edges: [], counts: { alwaysFiles: 0, lookupFiles: 0, unsureFacts: 0 } })
    expect(html).toContain("Nothing saved yet.")
    expect(html).not.toContain("<svg")
  })
})
