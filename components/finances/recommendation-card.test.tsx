import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

globalThis.React = React

// Mock next/navigation
const mockPush = vi.fn()
const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}))

// Mock finances server actions
const mockApproveRecommendation = vi.fn().mockResolvedValue({ ok: true, message: "Recommendation approved" })
const mockDiscardRecommendation = vi.fn().mockResolvedValue({ ok: true, message: "Recommendation discarded" })
const mockMarkSavingsRealized = vi.fn().mockResolvedValue({ ok: true, message: "Savings realized" })

vi.mock("@/lib/finances/actions", () => ({
  approveRecommendation: (...args: unknown[]) => mockApproveRecommendation(...args),
  discardRecommendation: (...args: unknown[]) => mockDiscardRecommendation(...args),
  markSavingsRealized: (...args: unknown[]) => mockMarkSavingsRealized(...args),
}))

// Setup node-compatible testing library simulation
const { customRender, customScreen, customFireEvent } = vi.hoisted(() => {
  let currentTree: React.ReactNode = null
  let renderFn: (() => React.ReactNode) | null = null

  function evaluateTree(node: React.ReactNode): React.ReactNode {
    if (!node) return null
    if (Array.isArray(node)) {
      return node.map(evaluateTree)
    }
    if (React.isValidElement(node)) {
      if (typeof node.type === "function") {
        const fn = node.type as (props: Record<string, unknown>) => React.ReactNode
        const res = fn((node.props as Record<string, unknown>) || {})
        return evaluateTree(res)
      }
      const props = node.props as Record<string, unknown> | undefined
      if (props && props.children) {
        if (Array.isArray(props.children)) {
          return React.cloneElement(node, {
            ...props,
            children: props.children.map(evaluateTree),
          } as Record<string, unknown>)
        } else {
          return React.cloneElement(node, {
            ...props,
            children: evaluateTree(props.children as React.ReactNode),
          } as Record<string, unknown>)
        }
      }
    }
    return node
  }

  function doRender() {
    if (renderFn) {
      currentTree = evaluateTree(renderFn())
    }
  }

  type ComponentProps = Record<string, unknown>
  type ComponentFunction = (props: ComponentProps) => React.ReactNode

  function customRender(element: React.ReactElement) {
    const Comp = element.type as ComponentFunction
    const props = (element.props as ComponentProps) || {}
    renderFn = () => Comp(props)
    doRender()
    return { container: currentTree }
  }

  function getText(node: React.ReactNode): string {
    if (node === null || node === undefined || typeof node === "boolean") return ""
    if (typeof node === "string" || typeof node === "number") return String(node)
    if (Array.isArray(node)) return node.map(getText).join("")
    if (React.isValidElement(node)) {
      const props = (node.props as Record<string, unknown>) || {}
      const selfText = typeof props["aria-label"] === "string" ? props["aria-label"] : ""
      const childText = props.children ? getText(props.children as React.ReactNode) : ""
      return (selfText ? selfText + " " : "") + childText
    }
    return ""
  }

  function findInTree(node: React.ReactNode, predicate: (n: React.ReactElement) => boolean): React.ReactElement[] {
    const found: React.ReactElement[] = []
    function walk(curr: React.ReactNode) {
      if (!curr) return
      if (Array.isArray(curr)) {
        curr.forEach(walk)
        return
      }
      if (React.isValidElement(curr)) {
        if (predicate(curr)) {
          found.push(curr)
        }
        const props = curr.props as Record<string, unknown> | undefined
        if (props && props.children) {
          walk(props.children as React.ReactNode)
        }
      }
    }
    walk(node)
    return found
  }

  type ElementHandle = {
    element: React.ReactElement
    props: Record<string, unknown>
    click: () => void
    submit: () => void
    change: (value: string) => void
  }

  function makeHandle(element: React.ReactElement): ElementHandle {
    const props = (element.props as Record<string, unknown>) || {}
    return {
      element,
      props,
      click: () => {
        const clickFn = props.onClick as ((e: unknown) => void) | undefined
        if (clickFn) {
          clickFn({ preventDefault: vi.fn(), stopPropagation: vi.fn() })
        }
      },
      submit: () => {
        const submitFn = props.onSubmit as ((e: unknown) => void) | undefined
        if (submitFn) {
          submitFn({ preventDefault: vi.fn(), stopPropagation: vi.fn() })
        }
      },
      change: (value: string) => {
        const changeFn = props.onChange as ((e: unknown) => void) | undefined
        if (changeFn) {
          changeFn({ target: { value } })
        }
      },
    }
  }

  const customScreen = {
    getByRole: (role: string, options?: { name?: RegExp | string }): ElementHandle => {
      const matches = findInTree(currentTree, (el) => {
        const props = (el.props as Record<string, unknown>) || {}
        const isRole = props.role === role || el.type === role
        if (!isRole) return false
        if (options?.name) {
          const text = getText(el)
          if (typeof options.name === "string") {
            return text.toLowerCase().includes(options.name.toLowerCase())
          }
          return options.name.test(text)
        }
        return true
      })
      if (matches.length === 0) {
        throw new Error(`Unable to find element with role="${role}"${options?.name ? ` matching ${options.name}` : ""}`)
      }
      return makeHandle(matches[0])
    },
    queryByRole: (role: string, options?: { name?: RegExp | string }): ElementHandle | null => {
      const matches = findInTree(currentTree, (el) => {
        const props = (el.props as Record<string, unknown>) || {}
        const isRole = props.role === role || el.type === role
        if (!isRole) return false
        if (options?.name) {
          const text = getText(el)
          if (typeof options.name === "string") {
            return text.toLowerCase().includes(options.name.toLowerCase())
          }
          return options.name.test(text)
        }
        return true
      })
      return matches.length > 0 ? makeHandle(matches[0]) : null
    },
    getByText: (matcher: RegExp | string): ElementHandle => {
      const matches = findInTree(currentTree, (el) => {
        const text = getText(el)
        if (typeof matcher === "string") {
          return text.includes(matcher)
        }
        return matcher.test(text)
      })
      if (matches.length === 0) {
        throw new Error(`Unable to find element matching text: ${matcher}`)
      }
      return makeHandle(matches[0])
    },
    queryByText: (matcher: RegExp | string): ElementHandle | null => {
      const matches = findInTree(currentTree, (el) => {
        const text = getText(el)
        if (typeof matcher === "string") {
          return text.includes(matcher)
        }
        return matcher.test(text)
      })
      return matches.length > 0 ? makeHandle(matches[0]) : null
    },
  }

  const fireEventObj = {
    click: (handle: ElementHandle) => handle.click(),
    submit: (handle: ElementHandle) => handle.submit(),
    change: (handle: ElementHandle, event: { target: { value: string } }) => handle.change(event.target.value),
  }

  return {
    customRender,
    customScreen,
    customFireEvent: fireEventObj,
  }
})


type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H?: Record<string, unknown>
  }
}
const internals = (React as unknown as ReactWithInternals).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

let localHookIndex = 0
let localHookStates: unknown[] = []

beforeEach(() => {
  vi.clearAllMocks()
  localHookIndex = 0
  localHookStates = []
  if (internals) {
    internals.H = {
      useState: (initial: unknown) => {
        const idx = localHookIndex++
        if (localHookStates.length <= idx) {
          localHookStates[idx] = typeof initial === "function" ? (initial as () => unknown)() : initial
        }
        const setState = (newVal: unknown) => {
          localHookStates[idx] = typeof newVal === "function" ? (newVal as (prev: unknown) => unknown)(localHookStates[idx]) : newVal
        }
        return [localHookStates[idx], setState]
      },
      useEffect: () => {},
      useCallback: (fn: unknown) => fn,
      useMemo: (fn: () => unknown) => fn(),
      useRef: (init: unknown) => ({ current: init }),
    }
  }

  // Setup clipboard mock
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      },
      configurable: true,
      writable: true,
    })
  } else {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
  }
})

const render = customRender
const screen = customScreen
const fireEvent = customFireEvent
import { RecommendationCard } from "./recommendation-card"
import { RunwayPulseBar } from "./runway-pulse-bar"
import { AuditFinancesForm } from "./audit-finances-form"
import { RecommendationList } from "./recommendation-list"
import type { FinancesRecommendation } from "@/lib/finances/recommendations"
import type { RunwayMetrics } from "@/lib/finances/runway"

describe("RecommendationCard", () => {
  const pendingRec: FinancesRecommendation = {
    id: "rec-1",
    date: "2026-09-27",
    title: "Downgrade Figma seats",
    vendor: "Figma",
    category: "Software",
    actionType: "downgrade",
    potentialSavingsMonthly: 45,
    currency: "USD",
    status: "pending",
    priority: "high",
    vendorUrl: "https://figma.com/settings/billing",
    finding: "Found 3 inactive seats.",
    actionPlan: "Downgrade before Oct 1.",
    draftPitch: "Please downgrade our plan.",
    fileName: "2026-09-27-figma.md",
    filePath: "/fake/2026-09-27-figma.md",
  }

  it("renders vendor, title, and savings highlight", () => {
    render(<RecommendationCard recommendation={pendingRec} companyId="acme" />)
    expect(screen.getByText("Figma")).toBeDefined()
    expect(screen.getByText("Downgrade Figma seats")).toBeDefined()
    expect(screen.getByText("+$45/mo")).toBeDefined()
  })

  it("renders Approve and Discard buttons for pending cards", () => {
    render(<RecommendationCard recommendation={pendingRec} companyId="acme" />)
    expect(screen.getByRole("button", { name: /approve/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /discard/i })).toBeDefined()
  })

  it("renders copy outreach draft button and realized button for approved cards", () => {
    const approvedRec: FinancesRecommendation = { ...pendingRec, status: "approved" }
    render(<RecommendationCard recommendation={approvedRec} companyId="acme" />)
    expect(screen.getByRole("button", { name: /copy outreach/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /mark savings realized/i })).toBeDefined()
  })

  it("handles approve action by calling approveRecommendation", async () => {
    render(<RecommendationCard recommendation={pendingRec} companyId="acme" />)
    const approveBtn = screen.getByRole("button", { name: /approve/i })
    fireEvent.click(approveBtn)
    expect(mockApproveRecommendation).toHaveBeenCalledWith("acme", "2026-09-27-figma.md")
  })

  it("handles discard action by calling discardRecommendation", async () => {
    render(<RecommendationCard recommendation={pendingRec} companyId="acme" />)
    const discardBtn = screen.getByRole("button", { name: /discard/i })
    fireEvent.click(discardBtn)
    expect(mockDiscardRecommendation).toHaveBeenCalledWith("acme", "2026-09-27-figma.md")
  })

  it("handles mark savings realized action by calling markSavingsRealized", async () => {
    const approvedRec: FinancesRecommendation = { ...pendingRec, status: "approved" }
    render(<RecommendationCard recommendation={approvedRec} companyId="acme" />)
    const realizedBtn = screen.getByRole("button", { name: /mark savings realized/i })
    fireEvent.click(realizedBtn)
    expect(mockMarkSavingsRealized).toHaveBeenCalledWith("acme", "2026-09-27-figma.md", 45)
  })

  it("handles copy outreach action by writing to clipboard", async () => {
    const approvedRec: FinancesRecommendation = { ...pendingRec, status: "approved" }
    render(<RecommendationCard recommendation={approvedRec} companyId="acme" />)
    const copyBtn = screen.getByRole("button", { name: /copy outreach/i })
    fireEvent.click(copyBtn)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Please downgrade our plan.")
  })
})

describe("RunwayPulseBar", () => {
  const sampleMetrics: RunwayMetrics = {
    cashBalance: 120000,
    monthlyBurn: 10000,
    runwayMonths: 12,
    currency: "USD",
    realizedSavingsMonthly: 500,
    realizedSavingsAnnual: 6000,
    healthColor: "emerald",
    healthLabel: "12 months (Strong)",
  }

  it("renders cash balance, monthly burn, and runway pill", () => {
    render(<RunwayPulseBar metrics={sampleMetrics} />)
    expect(screen.getByText("$120,000")).toBeDefined()
    expect(screen.getByText("$10,000")).toBeDefined()
    expect(screen.getByText("12 mo")).toBeDefined()
    expect(screen.getByText("12 months (Strong)")).toBeDefined()
  })

  it("renders realized savings when monthly savings are positive", () => {
    render(<RunwayPulseBar metrics={sampleMetrics} />)
    expect(screen.getByText("+$500/mo")).toBeDefined()
    expect(screen.getByText("realized ($6,000/yr)")).toBeDefined()
  })

  it("renders infinite runway when runwayMonths is 999", () => {
    const infiniteMetrics: RunwayMetrics = {
      ...sampleMetrics,
      runwayMonths: 999,
      monthlyBurn: 0,
      healthLabel: "Infinite (Profitable or 0 burn)",
    }
    render(<RunwayPulseBar metrics={infiniteMetrics} />)
    expect(screen.getByText("Infinite")).toBeDefined()
  })
})

describe("AuditFinancesForm", () => {
  it("renders form fields and submit button with initial values", () => {
    render(<AuditFinancesForm companyId="acme" initialCash={150000} initialBurn={12000} />)
    expect(screen.getByText(/Current cash on hand/i)).toBeDefined()
    expect(screen.getByText(/Estimated monthly burn/i)).toBeDefined()
    expect(screen.getByText(/Focus area/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /Audit finances/i })).toBeDefined()
  })
})

describe("RecommendationList", () => {
  const pendingRec: FinancesRecommendation = {
    id: "rec-1",
    date: "2026-09-27",
    title: "Downgrade Figma seats",
    vendor: "Figma",
    category: "Software",
    actionType: "downgrade",
    potentialSavingsMonthly: 45,
    currency: "USD",
    status: "pending",
    priority: "high",
    vendorUrl: "https://figma.com/settings/billing",
    finding: "Found 3 inactive seats.",
    actionPlan: "Downgrade before Oct 1.",
    draftPitch: "Please downgrade our plan.",
    fileName: "2026-09-27-figma.md",
    filePath: "/fake/2026-09-27-figma.md",
  }

  it("renders empty state messages when both lists are empty", () => {
    render(<RecommendationList pending={[]} approved={[]} companyId="acme" />)
    expect(screen.getByText("Waiting for you")).toBeDefined()
    expect(screen.getByText("Ready to act")).toBeDefined()
    expect(screen.getByText(/No recommendations pending review/i)).toBeDefined()
    expect(screen.getByText(/No approved recommendations waiting for action/i)).toBeDefined()
  })

  it("renders cards when items are provided in pending and approved", () => {
    const approvedRec: FinancesRecommendation = {
      ...pendingRec,
      id: "rec-2",
      title: "Cancel unused SaaS",
      status: "approved",
      fileName: "2026-09-27-saas.md",
    }
    render(<RecommendationList pending={[pendingRec]} approved={[approvedRec]} companyId="acme" />)
    expect(screen.getByText("Downgrade Figma seats")).toBeDefined()
    expect(screen.getByText("Cancel unused SaaS")).toBeDefined()
  })
})
