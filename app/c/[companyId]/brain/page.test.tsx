import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

vi.mock("next/link", () => ({ default: "a" }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("@/lib/get-effective-agents", () => ({ getEffectiveAgents: vi.fn() }))
vi.mock("@/lib/os/memory-items", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/os/memory-items")>()),
  listMemoryItems: vi.fn(async () => [{ path: "notes/a.md", kind: "note", title: "A", statement: "", changedAt: 1 }]),
}))
vi.mock("@/lib/os/memory-health/load", () => ({ loadMemoryHealth: vi.fn(async () => ({ state: "none" })) }))
vi.mock("@/components/os/brain/brain-dump", () => ({ BrainDump: () => null }))
const graph = { nodes: [], edges: [] }
vi.mock("@/lib/os/brain/memory-graph-read", () => ({ readMemoryGraph: vi.fn(async () => graph) }))
vi.mock("@/components/os/brain/memory-map", () => ({ MemoryMap: () => null }))

import BrainPage from "./page"
import { MemoryList } from "@/components/os/brain/memory-list"
import { MemoryMap } from "@/components/os/brain/memory-map"
import { MemoryHealthCard } from "@/components/os/memory-health-card"
import { loadMemoryHealth } from "@/lib/os/memory-health/load"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listMemoryItems } from "@/lib/os/memory-items"
import { readMemoryGraph } from "@/lib/os/brain/memory-graph-read"

function findAll(node: unknown, match: (el: React.ReactElement) => boolean, out: React.ReactElement[] = []): React.ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, match, out))
    return out
  }
  if (!React.isValidElement(node)) return out
  if (match(node)) out.push(node)
  findAll((node.props as { children?: unknown }).children, match, out)
  return out
}
const ofType = (tree: unknown, type: unknown) => findAll(tree, (el) => el.type === type)

async function render(view?: string) {
  vi.mocked(getEffectiveAgents).mockResolvedValue([{ id: "acme", name: "Acme", rootPath: "/fake/acme", kind: "command-set" }] as never)
  return BrainPage({
    params: Promise.resolve({ companyId: "acme" }),
    searchParams: Promise.resolve(view === undefined ? {} : { view }),
  })
}

describe("Brain page", () => {
  beforeEach(() => vi.clearAllMocks())

  it("opens on the memory map for this company, built from its committed content", async () => {
    const tree = await render()
    const map = ofType(tree, MemoryMap)
    expect(map).toHaveLength(1)
    expect(map[0].props).toMatchObject({ companyId: "acme", graph })
    expect(readMemoryGraph).toHaveBeenCalledWith("/fake/acme", "Acme")
    expect(ofType(tree, MemoryList)).toHaveLength(0)
    expect(listMemoryItems).not.toHaveBeenCalled()
    expect(JSON.stringify(tree)).toContain("What Alacrán knows")
  })

  it("falls back to the company id when the company has no name", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([{ id: "acme", rootPath: "/fake/acme", kind: "command-set" }] as never)
    await BrainPage({ params: Promise.resolve({ companyId: "acme" }), searchParams: Promise.resolve({}) })
    expect(readMemoryGraph).toHaveBeenCalledWith("/fake/acme", "acme")
  })

  it("shows the plain list behind ?view=list", async () => {
    const tree = await render("list")
    expect(ofType(tree, MemoryList)).toHaveLength(1)
    expect(ofType(tree, MemoryMap)).toHaveLength(0)
    expect(readMemoryGraph).not.toHaveBeenCalled()
    expect(listMemoryItems).toHaveBeenCalledWith("/fake/acme")
  })

  it("shows the map for the old ?view=map and any other value", async () => {
    for (const v of ["map", "nonsense"]) expect(ofType(await render(v), MemoryMap)).toHaveLength(1)
  })

  it("puts memory health above the list, loaded for this company", async () => {
    vi.mocked(loadMemoryHealth).mockResolvedValueOnce({ state: "unknown" })
    const tree = await render("list")
    expect(loadMemoryHealth).toHaveBeenCalledWith("/fake/acme")
    const card = ofType(tree, MemoryHealthCard)
    expect(card).toHaveLength(1)
    expect(card[0].props).toMatchObject({ companyId: "acme", health: { state: "unknown" } })
    const kids = React.Children.toArray((tree as React.ReactElement<{ children: React.ReactNode }>).props.children) as React.ReactElement[]
    const types = kids.map((k) => k.type)
    expect(types.indexOf(MemoryHealthCard)).toBe(types.indexOf(MemoryList) - 1)
  })

  it("does not check memory health for the map view", async () => {
    await render()
    expect(loadMemoryHealth).not.toHaveBeenCalled()
  })

  it("is not found for a company that does not exist", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([] as never)
    await expect(BrainPage({ params: Promise.resolve({ companyId: "nope" }), searchParams: Promise.resolve({}) })).rejects.toThrow("notFound")
  })
})
