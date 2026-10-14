import { describe, it, expect, vi, beforeEach } from "vitest"
import React, { type ReactElement } from "react"
import type { FinancesRecommendation } from "@/lib/finances/recommendations"
import type { RunwayMetrics } from "@/lib/finances/runway"
import type { DepartmentConnector } from "@/lib/os/departments/connectors"

globalThis.React = React

const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND")
})

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}))

const mockAgents = [
  { id: "test-corp", name: "Test Corp", rootPath: "/workspace/test-corp", kind: "command-set" },
]

vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: vi.fn(async () => mockAgents),
}))

const mockReadRunwayRecord = vi.fn(async (_rootPath: string): Promise<RunwayMetrics> => ({
  cashBalance: 150000,
  monthlyBurn: 12000,
  runwayMonths: 12.5,
  currency: "USD",
  realizedSavingsMonthly: 400,
  realizedSavingsAnnual: 4800,
  healthColor: "emerald",
  healthLabel: "12.5 months (Strong)",
}))

vi.mock("@/lib/finances/runway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finances/runway")>()
  return {
    ...actual,
    readRunwayRecord: (root: string) => mockReadRunwayRecord(root),
  }
})

const mockListRecommendations = vi.fn(async (_rootPath: string): Promise<FinancesRecommendation[]> => [])

vi.mock("@/lib/finances/recommendations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/finances/recommendations")>()
  return {
    ...actual,
    listRecommendations: (root: string) => mockListRecommendations(root),
  }
})

const mockResolveDepartmentConnectors = vi.fn(
  async (
    declared: { id: string; label: string }[],
    _options?: { companyPath?: string }
  ): Promise<DepartmentConnector[]> =>
    declared.map((c) => ({
      id: c.id,
      label: c.label,
      status: c.id === "stripe" ? "connected" : "not_configured",
    }))
)

vi.mock("@/lib/os/departments/connectors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/os/departments/connectors")>()
  return {
    ...actual,
    resolveDepartmentConnectors: (declared: { id: string; label: string }[], opts?: { companyPath?: string }) =>
      mockResolveDepartmentConnectors(declared, opts),
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

const { default: FinancesPage } = await import("./page")

const sampleRecommendations: FinancesRecommendation[] = [
  {
    id: "rec-1",
    date: "2026-09-27",
    title: "Downgrade Figma inactive seats",
    vendor: "Figma",
    category: "Software",
    actionType: "downgrade",
    potentialSavingsMonthly: 45,
    currency: "USD",
    status: "pending",
    priority: "high",
    vendorUrl: "https://figma.com/settings",
    finding: "3 inactive seats found.",
    actionPlan: "Downgrade unused seats.",
    draftPitch: "Please adjust our license count.",
    fileName: "2026-09-27-figma.md",
    filePath: "/workspace/test-corp/notes/finances/recommendations/2026-09-27-figma.md",
  },
  {
    id: "rec-2",
    date: "2026-09-27",
    title: "Switch AWS RDS to reserved instances",
    vendor: "AWS",
    category: "Infrastructure",
    actionType: "optimize",
    potentialSavingsMonthly: 300,
    currency: "USD",
    status: "approved",
    priority: "high",
    vendorUrl: "https://console.aws.amazon.com",
    finding: "Continuous RDS usage qualified for 1-year RI.",
    actionPlan: "Purchase reserved instance.",
    draftPitch: "Reserve RDS instances.",
    fileName: "2026-09-27-aws.md",
    filePath: "/workspace/test-corp/notes/finances/recommendations/2026-09-27-aws.md",
  },
  {
    id: "rec-3",
    date: "2026-09-26",
    title: "Cancel unused Loom subscription",
    vendor: "Loom",
    category: "Software",
    actionType: "cancel",
    potentialSavingsMonthly: 100,
    currency: "USD",
    status: "realized",
    priority: "medium",
    vendorUrl: "https://loom.com",
    finding: "Workspace has zero active users.",
    actionPlan: "Cancel subscription.",
    draftPitch: "Cancel our account.",
    fileName: "2026-09-26-loom.md",
    filePath: "/workspace/test-corp/notes/finances/recommendations/2026-09-26-loom.md",
  },
]

describe("FinancesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls notFound when agent does not exist", async () => {
    await expect(
      FinancesPage({ params: Promise.resolve({ companyId: "nonexistent" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND")

    expect(mockNotFound).toHaveBeenCalled()
  })

  it("loads runway metrics, recommendations, and department connectors with company rootPath", async () => {
    mockListRecommendations.mockResolvedValueOnce([])

    await FinancesPage({ params: Promise.resolve({ companyId: "test-corp" }) })

    expect(mockReadRunwayRecord).toHaveBeenCalledWith("/workspace/test-corp")
    expect(mockListRecommendations).toHaveBeenCalledWith("/workspace/test-corp")
    expect(mockResolveDepartmentConnectors).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "stripe", label: "Stripe" }),
        expect.objectContaining({ id: "mercury", label: "Mercury" }),
        expect.objectContaining({ id: "quickbooks", label: "QuickBooks" }),
        expect.objectContaining({ id: "brex", label: "Brex" }),
      ]),
      expect.objectContaining({ companyPath: "/workspace/test-corp" })
    )
  })

  it("renders page header and 5 main department sections", async () => {
    mockListRecommendations.mockResolvedValueOnce([])

    const page = await FinancesPage({ params: Promise.resolve({ companyId: "test-corp" }) })
    const allText = getTextContent(page)

    expect(allText).toContain("Finances & cash runway")

    // Section 1: Connected tools
    expect(allText).toContain("Connected tools")
    expect(allText).toContain("Stripe")
    expect(allText).toContain("Mercury")
    expect(allText).toContain("QuickBooks")
    expect(allText).toContain("Brex")

    // Section 2: Audit spend & cash runway
    expect(allText).toContain("Audit spend & cash runway")

    // Section 3: Runway pulse & Waiting for you
    expect(allText).toContain("Runway pulse & Waiting for you")

    // Section 4: Ready to act
    expect(allText).toContain("Ready to act")

    // Section 5: What Alacrán remembers
    expect(allText).toContain("What Alacrán remembers")
    expect(allText).toContain("records/finances/runway.yaml")
    expect(allText).toContain("Inspect raw files →")
  })

  it("passes initial cash balance and monthly burn to AuditFinancesForm", async () => {
    mockListRecommendations.mockResolvedValueOnce([])

    const page = await FinancesPage({ params: Promise.resolve({ companyId: "test-corp" }) })
    const formEl = findAllElements(
      page,
      (el) => typeof el.type === "function" && (el.type as { name?: string }).name === "AuditFinancesForm"
    )

    expect(formEl).toHaveLength(1)
    const props = formEl[0].props as { companyId: string; initialCash?: number; initialBurn?: number }
    expect(props.companyId).toBe("test-corp")
    expect(props.initialCash).toBe(150000)
    expect(props.initialBurn).toBe(12000)
  })

  it("partitions recommendations into pending, approved, and realized sections", async () => {
    mockListRecommendations.mockResolvedValueOnce(sampleRecommendations)

    const page = await FinancesPage({ params: Promise.resolve({ companyId: "test-corp" }) })
    const allText = getTextContent(page)

    // Check count badges in headers
    expect(allText).toMatch(/Waiting for you\s+\(1\)/)
    expect(allText).toMatch(/Ready to act\s+\(1\)/)

    // Find RecommendationList components
    const lists = findAllElements(
      page,
      (el) => typeof el.type === "function" && (el.type as { name?: string }).name === "RecommendationList"
    )
    expect(lists).toHaveLength(2)

    // Waiting for you list (pending)
    const pendingProps = lists[0].props as {
      recommendations?: FinancesRecommendation[]
      pending?: FinancesRecommendation[]
      companyId: string
    }
    const pendingItems = pendingProps.recommendations ?? pendingProps.pending
    expect(pendingProps.companyId).toBe("test-corp")
    expect(pendingItems).toHaveLength(1)
    expect(pendingItems![0].vendor).toBe("Figma")

    // Ready to act list (approved)
    const readyProps = lists[1].props as {
      recommendations?: FinancesRecommendation[]
      approved?: FinancesRecommendation[]
      companyId: string
    }
    const readyItems = readyProps.recommendations ?? readyProps.approved
    expect(readyProps.companyId).toBe("test-corp")
    expect(readyItems).toHaveLength(1)
    expect(readyItems![0].vendor).toBe("AWS")

    // Section 5: What Alacrán remembers (realized items & totals)
    expect(allText).toContain("Loom")
    expect(allText).toContain("+$100/mo realized")
    expect(allText).toContain("+$400/mo")
  })
})
