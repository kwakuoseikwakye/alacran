import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import {
  LeadStageStepper,
  TransactionStatusStepper,
  ContentStatusStepper,
} from "./interactive-status"
import {
  FunnelRecordsTable,
  FinancesRecordsTable,
  ContentRecordsTable,
  SocialRecordsTable,
} from "./department-records-client"
import * as Actions from "@/lib/os/records/actions"
import type { Lead } from "@/lib/os/schemas/funnel"
import type { Transaction } from "@/lib/os/schemas/finances"
import type { ContentItem } from "@/lib/os/schemas/content"
import type { SocialAccount } from "@/lib/os/schemas/social"

vi.mock("@/lib/os/records/actions", () => ({
  updateLeadStageAction: vi.fn(),
  updateTransactionStatusAction: vi.fn(),
  updateContentStageAction: vi.fn(),
  createLeadAction: vi.fn(),
  createTransactionAction: vi.fn(),
  createContentItemAction: vi.fn(),
}))

vi.mock("./modals", () => ({
  AddLeadModal: vi.fn(() => null),
  AddTransactionModal: vi.fn(() => null),
  AddContentModal: vi.fn(() => null),
}))

vi.mock("lucide-react", () => ({
  Loader2: vi.fn((props: Record<string, unknown>) => (
    <span data-testid="loader2-spinner" className={props.className as string} />
  )),
  Plus: vi.fn(() => <span data-testid="plus-icon" />),
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
      useLayoutEffect: () => {},
      useInsertionEffect: () => {},
      useCallback: (fn: unknown) => fn,
      useMemo: (fn: () => unknown) => fn(),
      useRef: (init: unknown) => ({ current: init }),
    }
  }
})

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
    change: (value: string) => {
      const changeFn = props.onChange as ((e: unknown) => void) | undefined
      if (changeFn) {
        changeFn({ target: { value } })
      }
    },
  }
}

const screen = {
  findSelect: (): ElementHandle => {
    const matches = findInTree(currentTree, (el) => el.type === "select")
    if (matches.length === 0) throw new Error("No <select> element found")
    return makeHandle(matches[0])
  },
  querySelect: (): ElementHandle | null => {
    const matches = findInTree(currentTree, (el) => el.type === "select")
    return matches.length > 0 ? makeHandle(matches[0]) : null
  },
  findButton: (): ElementHandle => {
    const matches = findInTree(currentTree, (el) => el.type === "button")
    if (matches.length === 0) throw new Error("No <button> element found")
    return makeHandle(matches[0])
  },
  queryButton: (): ElementHandle | null => {
    const matches = findInTree(currentTree, (el) => el.type === "button")
    return matches.length > 0 ? makeHandle(matches[0]) : null
  },
  queryByTestId: (testId: string): ElementHandle | null => {
    const matches = findInTree(currentTree, (el) => {
      const props = (el.props as Record<string, unknown>) || {}
      return props["data-testid"] === testId
    })
    return matches.length > 0 ? makeHandle(matches[0]) : null
  },
}

describe("LeadStageStepper", () => {
  it("renders with current stage selected and contains all options", () => {
    render(
      <LeadStageStepper
        companyId="company-123"
        leadId="lead-001"
        currentStage="qualified"
      />
    )

    const select = screen.findSelect()
    expect(select.props.value).toBe("qualified")
    expect(select.props["aria-label"]).toBe("Update stage for lead-001")
    expect(select.props.disabled).toBe(false)
    expect(screen.queryByTestId("loader2-spinner")).toBeNull()

    const options = (select.props.children as React.ReactElement[]).map(
      (opt) => (opt as React.ReactElement<{ value: string }>).props.value
    )
    expect(options).toEqual(["new", "qualified", "negotiation", "won", "lost"])
  })

  it("changes stage optimistically and invokes updateLeadStageAction", async () => {
    vi.mocked(Actions.updateLeadStageAction).mockResolvedValue({ ok: true })

    render(
      <LeadStageStepper
        companyId="company-123"
        leadId="lead-001"
        currentStage="new"
      />
    )

    const select = screen.findSelect()
    select.change("negotiation")

    expect(Actions.updateLeadStageAction).toHaveBeenCalledWith(
      "company-123",
      "lead-001",
      "negotiation"
    )

    // Wait for async handler
    await vi.waitFor(() => {
      const updatedSelect = screen.findSelect()
      expect(updatedSelect.props.value).toBe("negotiation")
      expect(updatedSelect.props.disabled).toBe(false)
      expect(screen.queryByTestId("loader2-spinner")).toBeNull()
    })
  })

  it("rolls back to previous stage when updateLeadStageAction fails", async () => {
    vi.mocked(Actions.updateLeadStageAction).mockResolvedValue({
      ok: false,
      error: "Git commit failed",
    })

    render(
      <LeadStageStepper
        companyId="company-123"
        leadId="lead-001"
        currentStage="qualified"
      />
    )

    const select = screen.findSelect()
    select.change("won")

    await vi.waitFor(() => {
      const updatedSelect = screen.findSelect()
      expect(updatedSelect.props.value).toBe("qualified")
      expect(updatedSelect.props.disabled).toBe(false)
      expect(screen.queryByTestId("loader2-spinner")).toBeNull()
    })
  })

  it("rolls back to previous stage when updateLeadStageAction throws", async () => {
    vi.mocked(Actions.updateLeadStageAction).mockRejectedValue(
      new Error("Network disconnect")
    )

    render(
      <LeadStageStepper
        companyId="company-123"
        leadId="lead-001"
        currentStage="qualified"
      />
    )

    const select = screen.findSelect()
    select.change("lost")

    await vi.waitFor(() => {
      const updatedSelect = screen.findSelect()
      expect(updatedSelect.props.value).toBe("qualified")
      expect(updatedSelect.props.disabled).toBe(false)
      expect(screen.queryByTestId("loader2-spinner")).toBeNull()
    })
  })

  it("ignores change if the target stage is equal to the current stage", () => {
    render(
      <LeadStageStepper
        companyId="company-123"
        leadId="lead-001"
        currentStage="qualified"
      />
    )

    const select = screen.findSelect()
    select.change("qualified")

    expect(Actions.updateLeadStageAction).not.toHaveBeenCalled()
  })
})

describe("TransactionStatusStepper", () => {
  it("renders 'cleared' with emerald styling", () => {
    render(
      <TransactionStatusStepper
        companyId="company-123"
        txnId="tx-001"
        currentStatus="cleared"
      />
    )

    const btn = screen.findButton()
    expect(btn.props["aria-label"]).toBe("Update status for tx-001")
    expect(btn.props.className).toContain("text-emerald-400")
    expect(btn.props.className).toContain("border-emerald-500/40")
    expect(btn.props.disabled).toBe(false)
    expect(screen.queryByTestId("loader2-spinner")).toBeNull()
  })

  it("renders 'pending' with amber styling", () => {
    render(
      <TransactionStatusStepper
        companyId="company-123"
        txnId="tx-001"
        currentStatus="pending"
      />
    )

    const btn = screen.findButton()
    expect(btn.props.className).toContain("text-amber-400")
    expect(btn.props.className).toContain("border-amber-500/40")
    expect(btn.props.disabled).toBe(false)
  })

  it("toggles status from cleared to pending on click and updates server", async () => {
    vi.mocked(Actions.updateTransactionStatusAction).mockResolvedValue({ ok: true })

    render(
      <TransactionStatusStepper
        companyId="company-123"
        txnId="tx-001"
        currentStatus="cleared"
      />
    )

    const btn = screen.findButton()
    btn.click()

    expect(Actions.updateTransactionStatusAction).toHaveBeenCalledWith(
      "company-123",
      "tx-001",
      "pending"
    )

    await vi.waitFor(() => {
      const updatedBtn = screen.findButton()
      expect(updatedBtn.props.className).toContain("text-amber-400")
      expect(updatedBtn.props.disabled).toBe(false)
      expect(screen.queryByTestId("loader2-spinner")).toBeNull()
    })
  })

  it("toggles status from pending to cleared on click", async () => {
    vi.mocked(Actions.updateTransactionStatusAction).mockResolvedValue({ ok: true })

    render(
      <TransactionStatusStepper
        companyId="company-123"
        txnId="tx-001"
        currentStatus="pending"
      />
    )

    const btn = screen.findButton()
    btn.click()

    expect(Actions.updateTransactionStatusAction).toHaveBeenCalledWith(
      "company-123",
      "tx-001",
      "cleared"
    )

    await vi.waitFor(() => {
      const updatedBtn = screen.findButton()
      expect(updatedBtn.props.className).toContain("text-emerald-400")
      expect(updatedBtn.props.disabled).toBe(false)
    })
  })

  it("rolls back to previous status when updateTransactionStatusAction returns error", async () => {
    vi.mocked(Actions.updateTransactionStatusAction).mockResolvedValue({
      ok: false,
      error: "Failed to update",
    })

    render(
      <TransactionStatusStepper
        companyId="company-123"
        txnId="tx-001"
        currentStatus="cleared"
      />
    )

    const btn = screen.findButton()
    btn.click()

    await vi.waitFor(() => {
      const updatedBtn = screen.findButton()
      expect(updatedBtn.props.className).toContain("text-emerald-400")
      expect(updatedBtn.props.disabled).toBe(false)
      expect(screen.queryByTestId("loader2-spinner")).toBeNull()
    })
  })

  it("rolls back to previous status when updateTransactionStatusAction throws", async () => {
    vi.mocked(Actions.updateTransactionStatusAction).mockRejectedValue(
      new Error("Timeout")
    )

    render(
      <TransactionStatusStepper
        companyId="company-123"
        txnId="tx-001"
        currentStatus="pending"
      />
    )

    const btn = screen.findButton()
    btn.click()

    await vi.waitFor(() => {
      const updatedBtn = screen.findButton()
      expect(updatedBtn.props.className).toContain("text-amber-400")
      expect(updatedBtn.props.disabled).toBe(false)
    })
  })
})

describe("ContentStatusStepper", () => {
  it("renders with current status selected and contains all options", () => {
    render(
      <ContentStatusStepper
        companyId="company-123"
        itemId="content-001"
        currentStatus="review"
      />
    )

    const select = screen.findSelect()
    expect(select.props.value).toBe("review")
    expect(select.props["aria-label"]).toBe("Update status for content-001")
    expect(select.props.disabled).toBe(false)
    expect(screen.queryByTestId("loader2-spinner")).toBeNull()

    const options = (select.props.children as React.ReactElement[]).map(
      (opt) => (opt as React.ReactElement<{ value: string }>).props.value
    )
    expect(options).toEqual([
      "idea",
      "draft",
      "review",
      "scheduled",
      "published",
      "archived",
    ])
  })

  it("changes status optimistically and invokes updateContentStageAction", async () => {
    vi.mocked(Actions.updateContentStageAction).mockResolvedValue({ ok: true })

    render(
      <ContentStatusStepper
        companyId="company-123"
        itemId="content-001"
        currentStatus="idea"
      />
    )

    const select = screen.findSelect()
    select.change("published")

    expect(Actions.updateContentStageAction).toHaveBeenCalledWith(
      "company-123",
      "content-001",
      "published"
    )

    await vi.waitFor(() => {
      const updatedSelect = screen.findSelect()
      expect(updatedSelect.props.value).toBe("published")
      expect(updatedSelect.props.disabled).toBe(false)
      expect(screen.queryByTestId("loader2-spinner")).toBeNull()
    })
  })

  it("rolls back to previous status when updateContentStageAction fails", async () => {
    vi.mocked(Actions.updateContentStageAction).mockResolvedValue({
      ok: false,
      error: "Failed to mutate content",
    })

    render(
      <ContentStatusStepper
        companyId="company-123"
        itemId="content-001"
        currentStatus="draft"
      />
    )

    const select = screen.findSelect()
    select.change("scheduled")

    await vi.waitFor(() => {
      const updatedSelect = screen.findSelect()
      expect(updatedSelect.props.value).toBe("draft")
      expect(updatedSelect.props.disabled).toBe(false)
    })
  })

  it("rolls back to previous status when updateContentStageAction throws", async () => {
    vi.mocked(Actions.updateContentStageAction).mockRejectedValue(
      new Error("Network error")
    )

    render(
      <ContentStatusStepper
        companyId="company-123"
        itemId="content-001"
        currentStatus="scheduled"
      />
    )

    const select = screen.findSelect()
    select.change("archived")

    await vi.waitFor(() => {
      const updatedSelect = screen.findSelect()
      expect(updatedSelect.props.value).toBe("scheduled")
      expect(updatedSelect.props.disabled).toBe(false)
    })
  })

  it("ignores change if the target status is equal to the current status", () => {
    render(
      <ContentStatusStepper
        companyId="company-123"
        itemId="content-001"
        currentStatus="review"
      />
    )

    const select = screen.findSelect()
    select.change("review")

    expect(Actions.updateContentStageAction).not.toHaveBeenCalled()
  })
})

describe("department-records-client integration", () => {
  const dummyLead: Lead = {
    id: "lead_101",
    name: "Acme Corp",
    stage: "qualified",
    source: "Inbound",
    owner: "agent",
    value: 12000,
    currency: "USD",
    first_seen: "2026-09-01",
    last_touch: "2026-09-18",
  }

  const dummyTxn: Transaction = {
    id: "tx_101",
    date: "2026-09-15",
    description: "Cloud Hosting",
    amount: 250,
    currency: "USD",
    type: "expense",
    category: "Infrastructure",
    account: "Operating",
    status: "cleared",
  }

  const dummyContent: ContentItem = {
    id: "cnt_101",
    title: "Why Local-First AI Matters",
    status: "draft",
    type: "article",
    channel: "blog",
    author: "agent",
  }

  const _dummySocial: SocialAccount = {
    id: "soc_101",
    handle: "@acmecorp",
    platform: "x",
    followers: 5400,
    url: "https://x.com/acmecorp",
    last_sync: "2026-09-18",
  }

  it("FunnelRecordsTable renders interactive LeadStageStepper when companyId provided", () => {
    render(
      <FunnelRecordsTable
        records={[dummyLead]}
        recordPath="records/funnel/leads.yaml"
        companyId="company-abc"
      />
    )

    const select = screen.findSelect()
    expect(select.props.value).toBe("qualified")
  })

  it("FunnelRecordsTable renders static stage badge when companyId omitted", () => {
    render(
      <FunnelRecordsTable
        records={[dummyLead]}
        recordPath="records/funnel/leads.yaml"
      />
    )

    expect(screen.querySelect()).toBeNull()
  })

  it("FunnelRecordsTable passes departmentName and companyId for empty state create button", () => {
    render(
      <FunnelRecordsTable
        records={[]}
        recordPath="records/funnel/leads.yaml"
        companyId="company-abc"
      />
    )

    const btn = screen.findButton()
    expect(btn.props.children).toContain("Add your first lead")
  })

  it("FinancesRecordsTable renders interactive TransactionStatusStepper when companyId provided", () => {
    render(
      <FinancesRecordsTable
        records={[dummyTxn]}
        recordPath="records/finances/transactions.yaml"
        companyId="company-abc"
      />
    )

    const btn = screen.findButton()
    expect(btn.props.className).toContain("text-emerald-400")
  })

  it("FinancesRecordsTable renders static status when companyId omitted", () => {
    render(
      <FinancesRecordsTable
        records={[dummyTxn]}
        recordPath="records/finances/transactions.yaml"
      />
    )

    // No stepper button
    expect(screen.queryButton()).toBeNull()
  })

  it("FinancesRecordsTable passes departmentName and companyId for empty state create button", () => {
    render(
      <FinancesRecordsTable
        records={[]}
        recordPath="records/finances/transactions.yaml"
        companyId="company-abc"
      />
    )

    const btn = screen.findButton()
    expect(btn.props.children).toContain("Log your first transaction")
  })

  it("ContentRecordsTable renders interactive ContentStatusStepper when companyId provided", () => {
    render(
      <ContentRecordsTable
        records={[dummyContent]}
        recordPath="records/content/items.yaml"
        companyId="company-abc"
      />
    )

    const select = screen.findSelect()
    expect(select.props.value).toBe("draft")
  })

  it("ContentRecordsTable renders static status when companyId omitted", () => {
    render(
      <ContentRecordsTable
        records={[dummyContent]}
        recordPath="records/content/items.yaml"
      />
    )

    expect(screen.querySelect()).toBeNull()
  })

  it("ContentRecordsTable passes departmentName and companyId for empty state create button", () => {
    render(
      <ContentRecordsTable
        records={[]}
        recordPath="records/content/items.yaml"
        companyId="company-abc"
      />
    )

    const btn = screen.findButton()
    expect(btn.props.children).toContain("Add your first content item")
  })

  it("SocialRecordsTable renders empty state without create record button", () => {
    render(
      <SocialRecordsTable
        records={[]}
        recordPath="records/social/accounts.yaml"
        companyId="company-abc"
      />
    )

    // Social has no create button
    expect(screen.queryButton()).toBeNull()
  })
})
