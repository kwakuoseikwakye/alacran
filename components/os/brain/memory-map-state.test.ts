import { describe, it, expect } from "vitest"
import { confirmFactPrompt, litNodes, neighbours, visibleNodes } from "./memory-map-state"
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
  it("names the fact and where it lives", () => {
    expect(confirmFactPrompt(node({ label: "Release bottleneck", path: "definitions/ontology/company.yaml" }))).toBe(
      "Let's settle this unconfirmed fact in company.yaml: Release bottleneck (definitions/ontology/company.yaml). Ask me what's true, then propose the edit for approval."
    )
  })
})
