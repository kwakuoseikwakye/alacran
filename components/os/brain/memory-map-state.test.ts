import { describe, it, expect } from "vitest"
import { neighbours, visibleNodes } from "./memory-map-state"
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
