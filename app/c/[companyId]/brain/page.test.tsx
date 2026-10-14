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
vi.mock("@/components/os/brain/brain-graph-view", () => ({ BrainGraphView: () => null }))
vi.mock("@/lib/os/brain/adapter", () => ({ buildBrainViewModel: vi.fn(() => ({})) }))
vi.mock("@/lib/os/brain/definitions-files", () => ({ readDefinitionsTree: vi.fn(async () => []) }))
vi.mock("@/lib/assistant/gather-all-companies", () => ({ gatherCrossCompanyDecisions: vi.fn(async () => []) }))
vi.mock("@/lib/os/ontology/read", () => ({ readOntology: vi.fn(async () => ({ ok: false })) }))
vi.mock("@/lib/os/departments/registry", () => ({ getCompanyDepartments: vi.fn(() => [{ id: "d", roles: [] }]) }))

import BrainPage from "./page"
import { MemoryList } from "@/components/os/brain/memory-list"
import { BrainGraphView } from "@/components/os/brain/brain-graph-view"
import { MemoryHealthCard } from "@/components/os/memory-health-card"
import { loadMemoryHealth } from "@/lib/os/memory-health/load"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listMemoryItems } from "@/lib/os/memory-items"
import { buildBrainViewModel } from "@/lib/os/brain/adapter"

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

  it("opens on the plain list, named for what it is, without building the map", async () => {
    const tree = await render()
    expect(ofType(tree, MemoryList)).toHaveLength(1)
    expect(ofType(tree, BrainGraphView)).toHaveLength(0)
    expect(buildBrainViewModel).not.toHaveBeenCalled()
    expect(listMemoryItems).toHaveBeenCalledWith("/fake/acme")
    expect(JSON.stringify(tree)).toContain("What Alacrán knows")
  })

  it("keeps the existing map behind ?view=map", async () => {
    const tree = await render("map")
    expect(ofType(tree, BrainGraphView)).toHaveLength(1)
    expect(ofType(tree, MemoryList)).toHaveLength(0)
    expect(listMemoryItems).not.toHaveBeenCalled()
  })

  it("puts memory health above the list, loaded for this company", async () => {
    vi.mocked(loadMemoryHealth).mockResolvedValueOnce({ state: "unknown" })
    const tree = await render()
    expect(loadMemoryHealth).toHaveBeenCalledWith("/fake/acme")
    const card = ofType(tree, MemoryHealthCard)
    expect(card).toHaveLength(1)
    expect(card[0].props).toMatchObject({ companyId: "acme", health: { state: "unknown" } })
    const kids = React.Children.toArray((tree as React.ReactElement<{ children: React.ReactNode }>).props.children) as React.ReactElement[]
    const types = kids.map((k) => k.type)
    expect(types.indexOf(MemoryHealthCard)).toBe(types.indexOf(MemoryList) - 1)
  })

  it("does not check memory health for the map view", async () => {
    await render("map")
    expect(loadMemoryHealth).not.toHaveBeenCalled()
  })

  it("falls back to the list for a view it does not know", async () => {
    const tree = await render("nonsense")
    expect(ofType(tree, MemoryList)).toHaveLength(1)
  })

  it("is not found for a company that does not exist", async () => {
    vi.mocked(getEffectiveAgents).mockResolvedValue([] as never)
    await expect(BrainPage({ params: Promise.resolve({ companyId: "nope" }), searchParams: Promise.resolve({}) })).rejects.toThrow("notFound")
  })
})
