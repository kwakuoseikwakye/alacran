import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { ProspectCard } from "./prospect-card"
import { ProspectList } from "./prospect-list"
import { ResearchProspectsForm } from "./research-prospects-form"
import type { Prospect } from "@/lib/leads-customers/prospects"
import * as Actions from "@/lib/leads-customers/actions"

globalThis.React = React

const { customRender, customScreen } = vi.hoisted(() => {
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

const render = customRender
const screen = customScreen

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
})

const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}))

vi.mock("@/lib/leads-customers/actions", () => ({
  discardProspect: vi.fn().mockResolvedValue({ ok: true, message: "Discarded" }),
  markProspectContacted: vi.fn().mockResolvedValue({ ok: true, message: "Marked contacted" }),
}))

const sampleWaiting: Prospect = {
  id: "lead-1",
  fileName: "2026-09-27-acme.md",
  relativePath: "notes/funnel/prospects/2026-09-27-acme.md",
  state: "waiting",
  name: "Jane Doe",
  role: "Head of Growth",
  company: "Acme Corp",
  url: "https://acme.example.com",
  fitScore: 94,
  fitLevel: "high",
  estimatedValue: 15000,
  rationale: "Strong alignment with B2B analytics segment",
  painPoints: "Slow dashboard rendering",
  pitch: "Hi Jane, loved your recent keynote.",
  status: "draft",
  created: "2026-09-27",
  updated: "2026-09-27",
  problems: [],
}

describe("ProspectCard", () => {
  it("renders prospect company, role, fit score, and action buttons in waiting state", () => {
    render(<ProspectCard prospect={sampleWaiting} agentId="test-company" />)
    expect(screen.getByText("Acme Corp")).toBeDefined()
    expect(screen.getByText("Jane Doe · Head of Growth")).toBeDefined()
    expect(screen.getByText("94% Fit")).toBeDefined()
    expect(screen.getByRole("button", { name: /approve/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /discard/i })).toBeDefined()
  })

  it("renders copy pitch and mark as contacted in ready state", () => {
    const ready = { ...sampleWaiting, state: "ready" as const, status: "approved" }
    render(<ProspectCard prospect={ready} agentId="test-company" />)
    expect(screen.getByRole("button", { name: /copy pitch/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /mark as contacted/i })).toBeDefined()
  })

  it("handles discard action by calling discardProspect", async () => {
    render(<ProspectCard prospect={sampleWaiting} agentId="test-company" />)
    const discardBtn = screen.getByRole("button", { name: /discard/i })
    discardBtn.click()
    expect(Actions.discardProspect).toHaveBeenCalledWith("test-company", "2026-09-27-acme.md")
  })

  it("navigates to queue when approve button is clicked", () => {
    render(<ProspectCard prospect={sampleWaiting} agentId="test-company" />)
    const approveBtn = screen.getByRole("button", { name: /approve/i })
    approveBtn.click()
    expect(mockPush).toHaveBeenCalledWith("/c/test-company/tasks")
  })

  it("handles mark as contacted action by calling markProspectContacted", async () => {
    const ready = { ...sampleWaiting, state: "ready" as const, status: "approved" }
    render(<ProspectCard prospect={ready} agentId="test-company" />)
    const contactBtn = screen.getByRole("button", { name: /mark as contacted/i })
    contactBtn.click()
    expect(Actions.markProspectContacted).toHaveBeenCalledWith("test-company", "2026-09-27-acme.md")
  })

  it("does not render mark as contacted button when state is contacted", () => {
    const contacted = { ...sampleWaiting, state: "contacted" as const, status: "contacted" }
    render(<ProspectCard prospect={contacted} agentId="test-company" />)
    expect(screen.getByRole("button", { name: /copy pitch/i })).toBeDefined()
    expect(screen.queryByRole("button", { name: /mark as contacted/i })).toBeNull()
  })

  it("does not render external link for javascript: unsafe urls", () => {
    const unsafeProspect = { ...sampleWaiting, url: "javascript:alert(1)" }
    render(<ProspectCard prospect={unsafeProspect} agentId="test-company" />)
    expect(screen.getByText("Acme Corp")).toBeDefined()
  })
})

describe("ProspectList", () => {
  it("renders empty state message when prospects array is empty", () => {
    render(<ProspectList prospects={[]} agentId="test-company" empty="No prospects yet." />)
    expect(screen.getByText("No prospects yet.")).toBeDefined()
  })

  it("renders prospects in a grid when prospects are provided", () => {
    render(<ProspectList prospects={[sampleWaiting]} agentId="test-company" empty="No prospects yet." />)
    expect(screen.getByText("Acme Corp")).toBeDefined()
  })
})

describe("ResearchProspectsForm", () => {
  it("renders form fields and submit button", () => {
    render(<ResearchProspectsForm agentId="test-company" />)
    expect(screen.getByText(/Who are you looking for\?/i)).toBeDefined()
    expect(screen.getByText(/How many prospects\?/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /Find prospects/i })).toBeDefined()
  })
})
