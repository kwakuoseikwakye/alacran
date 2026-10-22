import { describe, it, expect } from "vitest"
import { confirmFactPrompt, fitTransform, labelSize, linkify, litNodes, neighbours, panInto, shouldLabel, visibleNodes } from "./memory-map-state"
import { buildLinkIndex } from "@/lib/os/brain/memory-links"
import type { MemoryNode } from "@/lib/os/brain/memory-graph-types"

const node = (over: Partial<MemoryNode>): MemoryNode => ({ id: "a", type: "note", label: "A", path: "notes/a.md", summary: "", state: "lookup", ...over })

describe("neighbours", () => {
  it("is symmetric", () => {
    const edges = [{ source: "a", target: "b" }, { source: "c", target: "a" }]
    expect([...neighbours(edges, "a")].sort()).toEqual(["b", "c"])
    expect([...neighbours(edges, "b")]).toEqual(["a"])
    expect([...neighbours(edges, "c")]).toEqual(["a"])
  })
})

describe("visibleNodes", () => {
  const nodes = [
    node({ id: "hub", type: "hub", label: "Decisions", path: "" }),
    node({ id: "d", type: "decision", label: "Price by size", path: "docs/decisions/2026-01-01-price.md" }),
    node({ id: "n", type: "note", label: "Supplier call", path: "notes/company/supplier.md" }),
  ]

  it("shows everything for an empty query", () => {
    expect(visibleNodes(nodes, new Set(), "")).toEqual(new Set(["hub", "d", "n"]))
  })

  it("removes hidden types but always keeps hubs", () => {
    expect(visibleNodes(nodes, new Set(["decision", "hub"]), "")).toEqual(new Set(["hub", "n"]))
  })

  it("matches the query against the path, case-insensitive", () => {
    expect(visibleNodes(nodes, new Set(), "SUPPLIER.md")).toEqual(new Set(["hub", "n"]))
    expect(visibleNodes(nodes, new Set(), "price")).toEqual(new Set(["hub", "d"]))
  })
})

describe("litNodes", () => {
  const nodes = [
    node({ id: "a", state: "always" }),
    node({ id: "b", state: "unsure" }),
    node({ id: "c", state: "lookup" }),
  ]
  const edges = [{ source: "a", target: "c" }]

  it("lights everything when nothing is hovered, selected or focused", () => {
    expect(litNodes(nodes, edges, null, null)).toBeNull()
  })

  it("lights the focused state when no node is active", () => {
    expect(litNodes(nodes, edges, null, "unsure")).toEqual(new Set(["b"]))
  })

  it("lets an active node's neighbourhood win over a stat focus", () => {
    expect(litNodes(nodes, edges, "a", "unsure")).toEqual(new Set(["a", "c"]))
  })
})

describe("confirmFactPrompt", () => {
  it("names the fact, its yaml key and what it says now", () => {
    expect(
      confirmFactPrompt(
        node({ id: "yaml:product.bottleneck", label: "bottleneck", path: "definitions/ontology/company.yaml", summary: "Oven capacity" })
      )
    ).toBe(
      "Let's settle this unconfirmed fact in definitions/ontology/company.yaml: bottleneck (key product.bottleneck), which currently says \"Oven capacity\". Ask me what's true, then propose the edit for approval."
    )
  })

  it("leaves out an empty summary", () => {
    expect(confirmFactPrompt(node({ id: "yaml:a.b", label: "b", path: "definitions/ontology/company.yaml" }))).toBe(
      "Let's settle this unconfirmed fact in definitions/ontology/company.yaml: b (key a.b). Ask me what's true, then propose the edit for approval."
    )
  })
})

describe("fitTransform", () => {
  it("centres the padded bounding box and scales it to fit", () => {
    // box 0..100 x 0..50, pad 10 -> 120 x 70 into 240 x 280: k = min(2, 4) = 2
    const v = fitTransform([{ x: 0, y: 0 }, { x: 100, y: 50 }], 240, 280, 10)!
    expect(v.k).toBe(2)
    expect(v.x + 50 * v.k).toBe(120)
    expect(v.y + 25 * v.k).toBe(140)
  })

  it("clamps the scale between 0.3 and 2", () => {
    expect(fitTransform([{ x: 0, y: 0 }], 800, 600, 10)!.k).toBe(2)
    expect(fitTransform([{ x: 0, y: 0 }, { x: 100000, y: 0 }], 800, 600, 10)!.k).toBe(0.3)
  })

  it("gives nothing for no points", () => {
    expect(fitTransform([], 800, 600, 10)).toBeNull()
  })
})

describe("panInto", () => {
  const view = { x: 0, y: 0, k: 2 }

  it("keeps the view when the point is already inside", () => {
    expect(panInto({ x: 100, y: 100 }, view, 800, 600, 40)).toBe(view)
  })

  it("pans (never zooms) to centre a point outside the view", () => {
    expect(panInto({ x: 1000, y: 100 }, view, 800, 600, 40)).toEqual({ x: 400 - 2000, y: 300 - 200, k: 2 })
  })
})

describe("shouldLabel", () => {
  const ctx = { k: 1, selectedId: null, near: null, matches: null }

  it("always labels hubs, always-known, unsure and skill nodes", () => {
    expect(shouldLabel(node({ type: "hub" }), ctx)).toBe(true)
    expect(shouldLabel(node({ state: "always" }), ctx)).toBe(true)
    expect(shouldLabel(node({ state: "unsure" }), ctx)).toBe(true)
    expect(shouldLabel(node({ type: "skill" }), ctx)).toBe(true)
    expect(shouldLabel(node({ type: "session" }), ctx)).toBe(false)
  })

  it("labels the selected node, the active neighbourhood and search matches", () => {
    expect(shouldLabel(node({ id: "s" }), { ...ctx, selectedId: "s" })).toBe(true)
    expect(shouldLabel(node({ id: "n" }), { ...ctx, near: new Set(["n"]) })).toBe(true)
    expect(shouldLabel(node({ id: "m" }), { ...ctx, matches: new Set(["m"]) })).toBe(true)
  })

  it("labels everything once zoomed in to 1.4", () => {
    expect(shouldLabel(node({}), { ...ctx, k: 1.39 })).toBe(false)
    expect(shouldLabel(node({}), { ...ctx, k: 1.4 })).toBe(true)
  })
})

describe("linkify", () => {
  const index = buildLinkIndex(["notes/pricing.md", "docs/decisions/a.md"], [], { "notes/": "hub:notes" })

  it("splits text around resolved wiki links and paths", () => {
    expect(linkify("see [[pricing]] and docs/decisions/a.md", index, "notes/self.md")).toEqual([
      { text: "see " },
      { text: "[[pricing]]", nodeId: "notes/pricing.md" },
      { text: " and " },
      { text: "docs/decisions/a.md", nodeId: "docs/decisions/a.md" },
    ])
  })

  it("leaves unresolved links, dead paths and self-links as plain text", () => {
    const text = "[[x]] docs/decisions/gone.md [[pricing]]."
    expect(linkify(text, index, "notes/pricing.md")).toEqual([{ text }])
  })

  it("keeps trailing punctuation out of a path link and falls back to a folder hub", () => {
    expect(linkify("read docs/decisions/a.md, then notes/company/", index, "x")).toEqual([
      { text: "read " },
      { text: "docs/decisions/a.md", nodeId: "docs/decisions/a.md" },
      { text: ", then " },
      { text: "notes/company/", nodeId: "hub:notes" },
    ])
  })
})

describe("labelSize", () => {
  it("is 10 map units when zoomed in", () => {
    expect(labelSize(1.5, false)).toBe(10)
    expect(labelSize(1.5, true)).toBe(10)
  })
  it("keeps labels at least 9 screen px, and the focused dot's at 11, when zoomed out", () => {
    expect(labelSize(0.3, false) * 0.3).toBeCloseTo(9)
    expect(labelSize(0.3, true) * 0.3).toBeCloseTo(11)
  })
})
