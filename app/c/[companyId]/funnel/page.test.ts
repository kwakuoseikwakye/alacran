import { describe, it, expect, vi, beforeEach } from "vitest"
import React, { type ReactElement } from "react"
import type { Prospect } from "@/lib/leads-customers/prospects"

globalThis.React = React

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}))

const mockAgents = [
  { id: "test-corp", name: "Test Corp", rootPath: "/workspace/test-corp", kind: "command-set" },
]

vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: vi.fn(async () => mockAgents),
}))

const mockListProspects = vi.fn(async (_rootPath: string, _runRecordPath: string): Promise<Prospect[]> => [])

vi.mock("@/lib/leads-customers/prospects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/leads-customers/prospects")>()
  return {
    ...actual,
    listProspects: (root: string, run: string) => mockListProspects(root, run),
  }
})

function findAllElements(element: unknown, predicate: (el: ReactElement) => boolean): ReactElement[] {
  const results: ReactElement[] = []
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return
    if (!React.isValidElement(node)) return
    const el = node as ReactElement
    if (predicate(el)) results.push(el)
    const children = (el.props as Record<string, unknown> | undefined)?.children
    if (Array.isArray(children)) {
      for (const child of children) walk(child)
    } else if (children) {
      walk(children)
    }
  }
  walk(element)
  return results
}

function getTextContent(element: unknown): string {
  if (typeof element === "string" || typeof element === "number") return String(element)
  if (!element || typeof element !== "object") return ""
  if (!React.isValidElement(element)) return ""
  const el = element as ReactElement
  const children = (el.props as Record<string, unknown> | undefined)?.children
  if (Array.isArray(children)) {
    return children.map(getTextContent).join(" ")
  } else if (children) {
    return getTextContent(children)
  }
  return ""
}

const { default: FunnelPage } = await import("./page")

const sampleProspects: Prospect[] = [
  {
    id: "lead-1",
    fileName: "2026-09-27-alpha.md",
    relativePath: "notes/funnel/prospects/2026-09-27-alpha.md",
    state: "waiting",
    name: "Alice",
    role: "CEO",
    company: "Alpha Inc",
    url: "https://alpha.example.com",
    fitScore: 88,
    fitLevel: "high",
    estimatedValue: 12000,
    rationale: "Good fit",
    painPoints: "Scaling",
    pitch: "Hello Alice",
    status: "draft",
    created: "2026-09-27",
    updated: "2026-09-27",
    problems: [],
  },
  {
    id: "lead-2",
    fileName: "2026-09-27-beta.md",
    relativePath: "notes/funnel/prospects/2026-09-27-beta.md",
    state: "ready",
    name: "Bob",
    role: "CTO",
    company: "Beta LLC",
    url: "https://beta.example.com",
    fitScore: 92,
    fitLevel: "high",
    estimatedValue: 20000,
    rationale: "Enterprise readiness",
    painPoints: "Deployment speed",
    pitch: "Hello Bob",
    status: "approved",
    created: "2026-09-27",
    updated: "2026-09-27",
    problems: [],
  },
  {
    id: "lead-3",
    fileName: "2026-09-26-gamma.md",
    relativePath: "notes/funnel/prospects/2026-09-26-gamma.md",
    state: "contacted",
    name: "Charlie",
    role: "Founder",
    company: "Gamma Co",
    url: "https://gamma.example.com",
    fitScore: 80,
    fitLevel: "medium",
    estimatedValue: 8000,
    rationale: "Early stage",
    painPoints: "Pricing",
    pitch: "Hello Charlie",
    status: "contacted",
    contactedOn: "2026-09-26",
    created: "2026-09-26",
    updated: "2026-09-26",
    problems: [],
  },
  {
    id: "lead-4",
    fileName: "2026-09-27-delta.md",
    relativePath: "notes/funnel/prospects/2026-09-27-delta.md",
    state: "contacted",
    name: "Diana",
    role: "VP Eng",
    company: "Delta Corp",
    url: "https://delta.example.com",
    fitScore: 95,
    fitLevel: "high",
    estimatedValue: 25000,
    rationale: "Strategic client",
    painPoints: "Support",
    pitch: "Hello Diana",
    status: "contacted",
    contactedOn: "2026-09-27",
    created: "2026-09-27",
    updated: "2026-09-27",
    problems: [],
  },
]

describe("FunnelPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls notFound when agent does not exist", async () => {
    await expect(
      FunnelPage({ params: Promise.resolve({ companyId: "nonexistent" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND")

    expect(mockNotFound).toHaveBeenCalled()
  })

  it("calls listProspects with agent rootPath and run record path", async () => {
    mockListProspects.mockResolvedValueOnce([])

    await FunnelPage({ params: Promise.resolve({ companyId: "test-corp" }) })

    expect(mockListProspects).toHaveBeenCalledWith(
      "/workspace/test-corp",
      expect.stringContaining("test-corp/research-prospects.run.json")
    )
  })

  it("renders page header and 5 main department sections", async () => {
    mockListProspects.mockResolvedValueOnce([])

    const page = await FunnelPage({ params: Promise.resolve({ companyId: "test-corp" }) })
    const allText = getTextContent(page)

    expect(allText).toContain("Leads & customers")
    expect(allText).toContain("Alacrán researches target companies against your ontology")

    // Section 1: Connected tools
    expect(allText).toContain("Connected tools")
    expect(allText).toContain("Web & Market Research")
    expect(allText).toContain("Spreadsheet & CRM Export")

    // Section 2: Jobs
    expect(allText).toContain("Find & research prospects")

    // Section 3: Waiting
    expect(allText).toContain("Waiting for you")

    // Section 4: Ready
    expect(allText).toContain("Ready to reach out")

    // Section 5: Memory
    expect(allText).toContain("What Alacrán remembers")
    expect(allText).toContain("Prospects you mark as contacted are remembered here")
    expect(allText).toContain("Canonical index: records/funnel/leads.yaml")
    expect(allText).toContain("Inspect raw files →")
  })

  it("partitions prospects into waiting, ready, and contacted (with contacted reversed)", async () => {
    mockListProspects.mockResolvedValueOnce(sampleProspects)

    const page = await FunnelPage({ params: Promise.resolve({ companyId: "test-corp" }) })
    const allText = getTextContent(page)

    // Check count badges in section headers
    expect(allText).toMatch(/Waiting for you\s+\(1\)/)
    expect(allText).toMatch(/Ready to reach out\s+\(1\)/)

    // Find ProspectList elements
    const lists = findAllElements(page, (el) => typeof el.type === "function" && (el.type as { name?: string }).name === "ProspectList")
    expect(lists).toHaveLength(2)

    // Waiting list
    const waitingProps = lists[0].props as { prospects: Prospect[]; agentId: string; empty: string }
    expect(waitingProps.agentId).toBe("test-corp")
    expect(waitingProps.prospects).toHaveLength(1)
    expect(waitingProps.prospects[0].company).toBe("Alpha Inc")

    // Ready list
    const readyProps = lists[1].props as { prospects: Prospect[]; agentId: string; empty: string }
    expect(readyProps.agentId).toBe("test-corp")
    expect(readyProps.prospects).toHaveLength(1)
    expect(readyProps.prospects[0].company).toBe("Beta LLC")

    // Contacted list (reversed: Delta Corp first, then Gamma Co)
    expect(allText).toContain("Delta Corp")
    expect(allText).toMatch(/Diana\s+·\s+VP Eng/)
    expect(allText).toMatch(/Contacted\s+2026-09-27/)

    expect(allText).toContain("Gamma Co")
    expect(allText).toMatch(/Charlie\s+·\s+Founder/)
    expect(allText).toMatch(/Contacted\s+2026-09-26/)

    const deltaIndex = allText.indexOf("Delta Corp")
    const gammaIndex = allText.indexOf("Gamma Co")
    expect(deltaIndex).toBeLessThan(gammaIndex)
  })
})
