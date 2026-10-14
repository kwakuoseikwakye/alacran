import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import { CreateRecordButton } from "./create-record-button"
import { DepartmentShell } from "./department-shell"
import { RecordsTable } from "./records-table"
import * as Modals from "./modals"

// Mock child modals
vi.mock("./modals", () => ({
  AddLeadModal: vi.fn(({ companyId, isOpen, onClose }: { companyId: string; isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="mock-add-lead-modal" data-company-id={companyId}>
        <button onClick={onClose}>Close Lead Modal</button>
      </div>
    ) : null
  ),
  AddTransactionModal: vi.fn(({ companyId, isOpen, onClose }: { companyId: string; isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="mock-add-transaction-modal" data-company-id={companyId}>
        <button onClick={onClose}>Close Txn Modal</button>
      </div>
    ) : null
  ),
  AddContentModal: vi.fn(({ companyId, isOpen, onClose }: { companyId: string; isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="mock-add-content-modal" data-company-id={companyId}>
        <button onClick={onClose}>Close Content Modal</button>
      </div>
    ) : null
  ),
}))

// Mock RunAgentButton
vi.mock("./run-agent-button", () => ({
  RunAgentButton: vi.fn((props: Record<string, unknown>) => (
    <button data-testid="mock-run-agent-button" data-dept={props.departmentName as string}>
      Run Agent
    </button>
  )),
}))

// Mock ConnectorStatusStrip
vi.mock("./connector-status-strip", () => ({
  ConnectorStatusStrip: vi.fn(() => <div data-testid="mock-connector-status-strip" />),
}))

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

// React 19 node test harness
type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H?: Record<string, unknown>
  }
}
const internals = (React as unknown as ReactWithInternals)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

let currentTree: React.ReactNode = null
let hookStates: unknown[] = []
let hookIndex = 0
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
    if (typeof node.type === "object" && node.type !== null && "render" in node.type) {
      const forwardFn = (node.type as { render: (props: Record<string, unknown>, ref: unknown) => React.ReactNode }).render
      const res = forwardFn((node.props as Record<string, unknown>) || {}, null)
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
  hookIndex = 0
  if (renderFn) {
    currentTree = evaluateTree(renderFn())
  }
}

function render(element: React.ReactElement) {
  hookStates = []
  hookIndex = 0
  type ComponentFunction = (props: Record<string, unknown>) => React.ReactNode
  const Comp = element.type as ComponentFunction
  const props = (element.props as Record<string, unknown>) || {}
  renderFn = () => Comp(props)
  doRender()
  return { container: currentTree }
}

beforeEach(() => {
  vi.clearAllMocks()
  if (internals) {
    internals.H = {
      useState: (initial: unknown) => {
        const idx = hookIndex++
        if (hookStates.length <= idx) {
          hookStates[idx] = typeof initial === "function" ? (initial as () => unknown)() : initial
        }
        const setState = (newVal: unknown) => {
          hookStates[idx] =
            typeof newVal === "function"
              ? (newVal as (prev: unknown) => unknown)(hookStates[idx])
              : newVal
          doRender()
        }
        return [hookStates[idx], setState]
      },
      useEffect: () => {},
      useCallback: (fn: unknown) => fn,
      useMemo: (fn: () => unknown) => fn(),
      useRef: (init: unknown) => ({ current: init }),
    }
  }
})

function getText(node: React.ReactNode): string {
  if (!node) return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) {
    return node.map(getText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
  }
  if (React.isValidElement(node)) {
    const props = (node.props as Record<string, unknown>) || {}
    const selfText = typeof props["aria-label"] === "string" ? props["aria-label"] : ""
    const childText = props.children ? getText(props.children as React.ReactNode) : ""
    return `${selfText} ${childText}`.replace(/\s+/g, " ").trim()
  }
  return ""
}

function findInTree(
  node: React.ReactNode,
  predicate: (n: React.ReactElement) => boolean
): React.ReactElement[] {
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
  }
}

const screen = {
  findByText: (matcher: RegExp | string): ElementHandle => {
    const matches = findInTree(currentTree, (el) => {
      const text = getText(el)
      if (typeof matcher === "string") {
        return text === matcher || text.includes(matcher)
      }
      return matcher.test(text)
    })
    if (matches.length === 0) {
      throw new Error(`Unable to find element matching text: ${matcher}`)
    }
    const exact = matches.slice().reverse().find((el) => {
      const text = getText(el)
      return typeof matcher === "string" ? text === matcher : matcher.test(text)
    })
    return makeHandle(exact ?? matches[matches.length - 1])
  },
  queryByText: (matcher: RegExp | string): ElementHandle | null => {
    const matches = findInTree(currentTree, (el) => {
      const text = getText(el)
      if (typeof matcher === "string") {
        return text === matcher || text.includes(matcher)
      }
      return matcher.test(text)
    })
    if (matches.length === 0) return null
    const exact = matches.slice().reverse().find((el) => {
      const text = getText(el)
      return typeof matcher === "string" ? text === matcher : matcher.test(text)
    })
    return makeHandle(exact ?? matches[matches.length - 1])
  },
  findByTestId: (testId: string): ElementHandle => {
    const matches = findInTree(currentTree, (el) => {
      const props = (el.props as Record<string, unknown>) || {}
      return props["data-testid"] === testId
    })
    if (matches.length === 0) {
      throw new Error(`Unable to find element with data-testid: ${testId}`)
    }
    return makeHandle(matches[0])
  },
  queryByTestId: (testId: string): ElementHandle | null => {
    const matches = findInTree(currentTree, (el) => {
      const props = (el.props as Record<string, unknown>) || {}
      return props["data-testid"] === testId
    })
    return matches.length > 0 ? makeHandle(matches[0]) : null
  },
  findAllButtons: (): ElementHandle[] => {
    const matches = findInTree(currentTree, (el) => el.type === "button")
    return matches.map(makeHandle)
  },
}

describe("CreateRecordButton", () => {
  it("returns null for unknown / unsupported departments", () => {
    const { container: c1 } = render(
      <CreateRecordButton departmentName="social" companyId="company-1" />
    )
    expect(c1).toBeNull()

    const { container: c2 } = render(
      <CreateRecordButton departmentName="engineering" companyId="company-1" />
    )
    expect(c2).toBeNull()

    const { container: c3 } = render(
      <CreateRecordButton departmentName="" companyId="company-1" />
    )
    expect(c3).toBeNull()
  })

  describe("header variant (default)", () => {
    it("renders '+ New Lead' for funnel department", () => {
      render(
        <CreateRecordButton departmentName="Funnel" companyId="acme" />
      )

      const btn = screen.findByText("+ New Lead")
      expect(btn).toBeDefined()
      expect(btn.props.className).toContain("border-primary/40")
      expect(btn.props.className).toContain("bg-primary/20")
      // Modal should not be open initially
      expect(screen.queryByTestId("mock-add-lead-modal")).toBeNull()
      expect(Modals.AddLeadModal).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "acme", isOpen: false })
      )
    })

    it("renders '+ Log Transaction' for finances department", () => {
      render(
        <CreateRecordButton departmentName="Finances" companyId="acme" />
      )

      const btn = screen.findByText("+ Log Transaction")
      expect(btn).toBeDefined()
      expect(btn.props.className).toContain("border-primary/40")
      expect(screen.queryByTestId("mock-add-transaction-modal")).toBeNull()
      expect(Modals.AddTransactionModal).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "acme", isOpen: false })
      )
    })

    it("renders '+ New Content' for content department", () => {
      render(
        <CreateRecordButton departmentName="Content" companyId="acme" />
      )

      const btn = screen.findByText("+ New Content")
      expect(btn).toBeDefined()
      expect(btn.props.className).toContain("border-primary/40")
      expect(screen.queryByTestId("mock-add-content-modal")).toBeNull()
      expect(Modals.AddContentModal).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: "acme", isOpen: false })
      )
    })

    it("handles lowercase and uppercase department names gracefully", () => {
      render(
        <CreateRecordButton departmentName="FUNNEL" companyId="acme" />
      )
      expect(screen.findByText("+ New Lead")).toBeDefined()

      render(
        <CreateRecordButton departmentName="finances" companyId="acme" />
      )
      expect(screen.findByText("+ Log Transaction")).toBeDefined()
    })
  })

  describe("empty-state variant", () => {
    it("renders 'Add your first lead' with empty-state styling for funnel", () => {
      render(
        <CreateRecordButton
          departmentName="funnel"
          companyId="acme"
          variant="empty-state"
        />
      )

      const btn = screen.findByText("Add your first lead")
      expect(btn).toBeDefined()
      expect(btn.props.className).toContain("border-primary/50")
      expect(btn.props.className).toContain("mx-auto")
    })

    it("renders 'Log your first transaction' with empty-state styling for finances", () => {
      render(
        <CreateRecordButton
          departmentName="finances"
          companyId="acme"
          variant="empty-state"
        />
      )

      const btn = screen.findByText("Log your first transaction")
      expect(btn).toBeDefined()
      expect(btn.props.className).toContain("border-primary/50")
      expect(btn.props.className).toContain("mx-auto")
    })

    it("renders 'Add your first content item' with empty-state styling for content", () => {
      render(
        <CreateRecordButton
          departmentName="content"
          companyId="acme"
          variant="empty-state"
        />
      )

      const btn = screen.findByText("Add your first content item")
      expect(btn).toBeDefined()
      expect(btn.props.className).toContain("border-primary/50")
      expect(btn.props.className).toContain("mx-auto")
    })
  })

  describe("modal open & close interaction", () => {
    it("opens and closes AddLeadModal on funnel button click", () => {
      render(
        <CreateRecordButton departmentName="funnel" companyId="acme-corp" />
      )

      expect(screen.queryByTestId("mock-add-lead-modal")).toBeNull()

      // Click button to open modal
      const btn = screen.findByText("+ New Lead")
      btn.click()

      // Modal is now open
      const modal = screen.findByTestId("mock-add-lead-modal")
      expect(modal).toBeDefined()
      expect(modal.props["data-company-id"]).toBe("acme-corp")

      // Click modal close button
      const closeBtn = screen.findByText("Close Lead Modal")
      closeBtn.click()

      // Modal is closed
      expect(screen.queryByTestId("mock-add-lead-modal")).toBeNull()
    })

    it("opens and closes AddTransactionModal on finances button click", () => {
      render(
        <CreateRecordButton departmentName="finances" companyId="acme-corp" />
      )

      expect(screen.queryByTestId("mock-add-transaction-modal")).toBeNull()

      const btn = screen.findByText("+ Log Transaction")
      btn.click()

      const modal = screen.findByTestId("mock-add-transaction-modal")
      expect(modal).toBeDefined()
      expect(modal.props["data-company-id"]).toBe("acme-corp")

      const closeBtn = screen.findByText("Close Txn Modal")
      closeBtn.click()

      expect(screen.queryByTestId("mock-add-transaction-modal")).toBeNull()
    })

    it("opens and closes AddContentModal on content button click", () => {
      render(
        <CreateRecordButton departmentName="content" companyId="acme-corp" />
      )

      expect(screen.queryByTestId("mock-add-content-modal")).toBeNull()

      const btn = screen.findByText("+ New Content")
      btn.click()

      const modal = screen.findByTestId("mock-add-content-modal")
      expect(modal).toBeDefined()
      expect(modal.props["data-company-id"]).toBe("acme-corp")

      const closeBtn = screen.findByText("Close Content Modal")
      closeBtn.click()

      expect(screen.queryByTestId("mock-add-content-modal")).toBeNull()
    })
  })
})

describe("DepartmentShell integration", () => {
  it("renders CreateRecordButton in header next to RunAgentButton", () => {
    render(
      <DepartmentShell
        departmentName="Funnel"
        headlineMetric={{ label: "Pipeline", value: "$50,000" }}
        companyId="company-123"
        currentTab="overview"
        connectors={[]}
        owningAgent="sales-agent"
        commandId="update-funnel"
      >
        <div>Content</div>
      </DepartmentShell>
    )

    // Header contains CreateRecordButton (+ New Lead)
    expect(screen.findByText("+ New Lead")).toBeDefined()

    // Header contains RunAgentButton
    const runBtn = screen.findByTestId("mock-run-agent-button")
    expect(runBtn).toBeDefined()
    expect(runBtn.props["data-dept"]).toBe("Funnel")

    // Header contains View Activity link
    const activityLink = screen.findByText("View Activity")
    expect(activityLink).toBeDefined()
    expect(activityLink.props.href).toBe("/c/company-123/activity")
  })

  it("does not crash or show create button when department has no record creation", () => {
    render(
      <DepartmentShell
        departmentName="Social"
        headlineMetric={{ label: "Followers", value: "1,200" }}
        companyId="company-123"
        currentTab="overview"
        connectors={[]}
      >
        <div>Content</div>
      </DepartmentShell>
    )

    // Run agent button is there
    expect(screen.findByTestId("mock-run-agent-button")).toBeDefined()
    // No create record button is rendered
    expect(screen.queryByText("+ New Lead")).toBeNull()
    expect(screen.queryByText("+ Log Transaction")).toBeNull()
    expect(screen.queryByText("+ New Content")).toBeNull()
  })
})

describe("RecordsTable integration", () => {
  it("renders empty state with CreateRecordButton when records is empty and departmentName/companyId provided", () => {
    render(
      <RecordsTable<{ id: string }>
        records={[]}
        columns={[{ header: "ID", accessor: (r) => r.id }]}
        recordPath="records/funnel/leads.yaml"
        departmentName="Funnel"
        companyId="acme-inc"
      />
    )

    expect(screen.findByText("Honest Empty State")).toBeDefined()
    expect(screen.findByText("File path: records/funnel/leads.yaml")).toBeDefined()

    // Empty state button
    const btn = screen.findByText("Add your first lead")
    expect(btn).toBeDefined()
    expect(btn.props.className).toContain("mx-auto")
  })

  it("does not render CreateRecordButton in empty state when departmentName or companyId is missing", () => {
    render(
      <RecordsTable<{ id: string }>
        records={[]}
        columns={[{ header: "ID", accessor: (r) => r.id }]}
        recordPath="records/funnel/leads.yaml"
      />
    )

    expect(screen.findByText("Honest Empty State")).toBeDefined()
    expect(screen.queryByText("Add your first lead")).toBeNull()
  })

  it("does not render empty wrapper or button when department is not supported", () => {
    render(
      <RecordsTable<{ id: string }>
        records={[]}
        columns={[{ header: "ID", accessor: (r) => r.id }]}
        recordPath="records/social/posts.yaml"
        departmentName="Social"
        companyId="acme-inc"
      />
    )

    expect(screen.findByText("Honest Empty State")).toBeDefined()
    expect(screen.queryByText("Add your first lead")).toBeNull()
    expect(screen.queryByText("Log your first transaction")).toBeNull()
    expect(screen.queryByText("Add your first content item")).toBeNull()
    // Check that pt-1 wrapper div is not rendered
    const pt1Elements = findInTree(currentTree, (el) => {
      const props = (el.props as Record<string, unknown>) || {}
      return props.className === "pt-1"
    })
    expect(pt1Elements.length).toBe(0)
  })

  it("renders records table instead of empty state when records exist", () => {
    render(
      <RecordsTable<{ id: string; name: string }>
        records={[{ id: "rec_1", name: "Test Lead" }]}
        columns={[
          { header: "ID", accessor: (r) => r.id },
          { header: "Name", accessor: (r) => r.name },
        ]}
        recordPath="records/funnel/leads.yaml"
        departmentName="Funnel"
        companyId="acme-inc"
      />
    )

    expect(screen.queryByText("Honest Empty State")).toBeNull()
    expect(screen.queryByText("Add your first lead")).toBeNull()
    expect(screen.findByText("Showing 1 of 1 records")).toBeDefined()
    expect(screen.findByText("Test Lead")).toBeDefined()
  })
})
