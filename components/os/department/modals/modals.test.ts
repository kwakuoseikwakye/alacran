import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React
import {
  AddLeadModal,
  AddTransactionModal,
  AddContentModal,
} from "./index"
import {
  createLeadAction,
  createTransactionAction,
  createContentItemAction,
} from "@/lib/os/records/actions"

// Mock dialog primitives
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children?: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) =>
    open
      ? React.createElement(
          "div",
          { "data-slot": "dialog", "data-on-open-change": onOpenChange },
          children
        )
      : null,
  DialogContent: ({
    children,
    className,
  }: {
    children?: React.ReactNode
    className?: string
  }) => React.createElement("div", { "data-slot": "dialog-content", className }, children),
  DialogHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-slot": "dialog-header" }, children),
  DialogTitle: ({
    children,
    className,
  }: {
    children?: React.ReactNode
    className?: string
  }) => React.createElement("h2", { "data-slot": "dialog-title", className }, children),
  DialogDescription: ({
    children,
    className,
  }: {
    children?: React.ReactNode
    className?: string
  }) => React.createElement("p", { "data-slot": "dialog-description", className }, children),
  DialogFooter: ({
    children,
    className,
  }: {
    children?: React.ReactNode
    className?: string
  }) => React.createElement("div", { "data-slot": "dialog-footer", className }, children),
}))

// Mock server actions
vi.mock("@/lib/os/records/actions", () => ({
  createLeadAction: vi.fn(),
  createTransactionAction: vi.fn(),
  createContentItemAction: vi.fn(),
}))

const mockedCreateLeadAction = vi.mocked(createLeadAction)
const mockedCreateTransactionAction = vi.mocked(createTransactionAction)
const mockedCreateContentItemAction = vi.mocked(createContentItemAction)

// Harness for React 19 hooks simulation in node environment
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
  if (Array.isArray(node)) return node.map(getText).join(" ")
  if (React.isValidElement(node)) {
    const props = (node.props as Record<string, unknown>) || {}
    const selfText = typeof props["aria-label"] === "string" ? props["aria-label"] : ""
    const childText = props.children ? getText(props.children as React.ReactNode) : ""
    return (selfText + " " + childText).trim()
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
  change: (value: string) => void
  submit: () => void
  keyDown: (event: { key: string; metaKey?: boolean; ctrlKey?: boolean }) => void
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
    submit: () => {
      const submitFn = props.onSubmit as ((e: unknown) => void) | undefined
      if (submitFn) {
        submitFn({ preventDefault: vi.fn(), stopPropagation: vi.fn() })
      }
    },
    keyDown: (event: { key: string; metaKey?: boolean; ctrlKey?: boolean }) => {
      const keyDownFn = props.onKeyDown as ((e: unknown) => void) | undefined
      if (keyDownFn) {
        keyDownFn({
          key: event.key,
          metaKey: !!event.metaKey,
          ctrlKey: !!event.ctrlKey,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        })
      }
    },
  }
}

const screen = {
  findByPlaceholder: (matcher: RegExp | string): ElementHandle => {
    const matches = findInTree(currentTree, (el) => {
      const props = (el.props as Record<string, unknown>) || {}
      const placeholder = typeof props.placeholder === "string" ? props.placeholder : ""
      if (typeof matcher === "string") {
        return placeholder.toLowerCase().includes(matcher.toLowerCase())
      }
      return matcher.test(placeholder)
    })
    if (matches.length === 0) {
      throw new Error(`Unable to find element with placeholder matching: ${matcher}`)
    }
    return makeHandle(matches[0])
  },
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
    const exact = matches.find((el) => {
      const text = getText(el).trim()
      return typeof matcher === "string" ? text === matcher : matcher.test(text)
    })
    return makeHandle(exact ?? matches[matches.length - 1])
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
  findForm: (): ElementHandle => {
    const matches = findInTree(currentTree, (el) => el.type === "form")
    if (matches.length === 0) throw new Error("Unable to find form element")
    return makeHandle(matches[0])
  },
  findDialog: (): ElementHandle => {
    const matches = findInTree(currentTree, (el) => {
      const props = (el.props as Record<string, unknown>) || {}
      return props["data-slot"] === "dialog"
    })
    if (matches.length === 0) throw new Error("Unable to find dialog element")
    return makeHandle(matches[0])
  },
  findAllInputs: (): ElementHandle[] => {
    const matches = findInTree(currentTree, (el) => el.type === "input" || el.type === "select")
    return matches.map(makeHandle)
  },
  findAllButtons: (): ElementHandle[] => {
    const matches = findInTree(currentTree, (el) => el.type === "button")
    return matches.map(makeHandle)
  },
}

describe("Department Quick-Add Modals", () => {
  describe("AddLeadModal", () => {
    it("does not render dialog content when isOpen is false", () => {
      const { container } = render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: false,
          onClose: vi.fn(),
        })
      )
      expect(container).toBeNull()
    })

    it("renders title, description, form fields, and default values when isOpen is true", () => {
      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      expect(screen.findByText("Add New Sales Lead")).toBeDefined()
      expect(screen.findByText("Record a prospective client or deal directly into your funnel.")).toBeDefined()

      const nameInput = screen.findByPlaceholder("Acme Health Corp")
      expect(nameInput.props.value).toBe("")

      const inputs = screen.findAllInputs()
      // Deal Value input (number)
      const valueInput = inputs.find((i) => i.props.type === "number")
      expect(valueInput?.props.value).toBe("")

      // Stage select
      const stageSelect = inputs.find((i) => i.element.type === "select")
      expect(stageSelect?.props.value).toBe("new")

      // Source input
      const sourceInput = screen.findByPlaceholder("Inbound, Referral, Cold Outreach")
      expect(sourceInput.props.value).toBe("")

      // Action buttons
      expect(screen.findByText("Cancel")).toBeDefined()
      expect(screen.findByText("Save & Commit")).toBeDefined()
    })

    it("requires company/lead name and displays validation error without calling server action", async () => {
      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const form = screen.findForm()
      form.submit()

      expect(mockedCreateLeadAction).not.toHaveBeenCalled()
      expect(screen.findByText("Company or lead name is required")).toBeDefined()
    })

    it("submits lead with parsed value and stage on valid submission", async () => {
      const onClose = vi.fn()
      mockedCreateLeadAction.mockResolvedValueOnce({ ok: true, id: "lead_123" })

      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const nameInput = screen.findByPlaceholder("Acme Health Corp")
      nameInput.change("Wayne Enterprises")

      const inputs = screen.findAllInputs()
      const valueInput = inputs.find((i) => i.props.type === "number")
      valueInput?.change("75000")

      const stageSelect = inputs.find((i) => i.element.type === "select")
      stageSelect?.change("negotiation")

      const form = screen.findForm()
      await form.submit()

      expect(mockedCreateLeadAction).toHaveBeenCalledWith("company-1", {
        name: "Wayne Enterprises",
        value: 75000,
        stage: "negotiation",
        source: "direct",
      })

      expect(onClose).toHaveBeenCalled()
    })

    it("supports Cmd+Enter keyboard shortcut for submission", async () => {
      const onClose = vi.fn()
      mockedCreateLeadAction.mockResolvedValueOnce({ ok: true, id: "lead_shortcut" })

      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const nameInput = screen.findByPlaceholder("Acme Health Corp")
      nameInput.change("Cyberdyne")

      const form = screen.findForm()
      await form.keyDown({ key: "Enter", metaKey: true })

      expect(mockedCreateLeadAction).toHaveBeenCalledWith("company-1", {
        name: "Cyberdyne",
        value: 0,
        stage: "new",
        source: "direct",
      })
      expect(onClose).toHaveBeenCalled()
    })

    it("displays error returned by createLeadAction", async () => {
      const onClose = vi.fn()
      mockedCreateLeadAction.mockResolvedValueOnce({
        ok: false,
        error: "Funnel file is corrupted",
      })

      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const nameInput = screen.findByPlaceholder("Acme Health Corp")
      nameInput.change("Stark Industries")

      const form = screen.findForm()
      await form.submit()

      expect(mockedCreateLeadAction).toHaveBeenCalled()
      expect(screen.findByText("Funnel file is corrupted")).toBeDefined()
      expect(onClose).not.toHaveBeenCalled()
    })

    it("handles unexpected thrown errors from createLeadAction", async () => {
      mockedCreateLeadAction.mockRejectedValueOnce(new Error("Network timeout"))

      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const nameInput = screen.findByPlaceholder("Acme Health Corp")
      nameInput.change("Oscorp")

      const form = screen.findForm()
      await form.submit()

      expect(screen.findByText("Network timeout")).toBeDefined()
    })

    it("falls back to direct source and 0 value when input is empty or invalid", async () => {
      mockedCreateLeadAction.mockResolvedValueOnce({ ok: true, id: "lead_fb" })

      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const nameInput = screen.findByPlaceholder("Acme Health Corp")
      nameInput.change("Minimal Lead")

      const inputs = screen.findAllInputs()
      const valueInput = inputs.find((i) => i.props.type === "number")
      valueInput?.change("-50")

      const sourceInput = screen.findByPlaceholder("Inbound, Referral, Cold Outreach")
      sourceInput.change("   ")

      const form = screen.findForm()
      await form.submit()

      expect(mockedCreateLeadAction).toHaveBeenCalledWith("company-1", {
        name: "Minimal Lead",
        value: 0,
        stage: "new",
        source: "direct",
      })
    })

    it("disables buttons and shows spinner while action is in flight", async () => {
      let resolveAction!: (val: { ok: true; id: string }) => void
      mockedCreateLeadAction.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAction = resolve
        })
      )

      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const nameInput = screen.findByPlaceholder("Acme Health Corp")
      nameInput.change("Slow Co")

      const form = screen.findForm()
      // Do not await so we can inspect loading state
      const submitPromise = form.submit()

      const buttons = screen.findAllButtons()
      const cancelBtn = buttons.find((b) => getText(b.element) === "Cancel")
      const saveBtn = buttons.find((b) => getText(b.element).includes("Save & Commit"))

      expect(cancelBtn?.props.disabled).toBe(true)
      expect(saveBtn?.props.disabled).toBe(true)

      // Resolve the action
      resolveAction({ ok: true, id: "lead_slow" })
      await submitPromise
    })

    it("calls onClose when Cancel button is clicked", () => {
      const onClose = vi.fn()
      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const cancelBtn = screen.findByText("Cancel")
      cancelBtn.click()
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("guards onOpenChange from triggering onClose while loading", async () => {
      const onClose = vi.fn()
      let resolveAction!: (val: { ok: true; id: string }) => void
      mockedCreateLeadAction.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAction = resolve
        })
      )

      render(
        React.createElement(AddLeadModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const dialog = screen.findDialog()
      const onOpenChange = dialog.props["data-on-open-change"] as (open: boolean) => void

      // When not loading, closing triggers onClose
      onOpenChange(false)
      expect(onClose).toHaveBeenCalledTimes(1)
      onClose.mockClear()

      // Fill and submit form to enter loading state
      const nameInput = screen.findByPlaceholder("Acme Health Corp")
      nameInput.change("Slow Co")

      const form = screen.findForm()
      const submitPromise = form.submit()

      // While loading, onOpenChange(false) should NOT call onClose
      const dialogLoading = screen.findDialog()
      const onOpenChangeLoading = dialogLoading.props["data-on-open-change"] as (open: boolean) => void
      onOpenChangeLoading(false)
      expect(onClose).not.toHaveBeenCalled()

      resolveAction({ ok: true, id: "lead_slow" })
      await submitPromise
    })
  })

  describe("AddTransactionModal", () => {
    it("does not render dialog content when isOpen is false", () => {
      const { container } = render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: false,
          onClose: vi.fn(),
        })
      )
      expect(container).toBeNull()
    })

    it("renders title, description, form fields, and default values when isOpen is true", () => {
      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      expect(screen.findByText("Log Financial Transaction")).toBeDefined()
      expect(screen.findByText("Record income or an expense directly into your ledger.")).toBeDefined()

      const descInput = screen.findByPlaceholder("AWS Infrastructure, Client Retainer")
      expect(descInput.props.value).toBe("")

      const inputs = screen.findAllInputs()
      const amountInput = inputs.find((i) => i.props.type === "number")
      expect(amountInput?.props.value).toBe("")

      const categoryInput = screen.findByPlaceholder("Software, Payroll")
      expect(categoryInput.props.value).toBe("")

      const accountInput = screen.findByPlaceholder("Operating, Payroll")
      expect(accountInput.props.value).toBe("Operating")

      expect(screen.findByText("Cancel")).toBeDefined()
      expect(screen.findByText("Save & Commit")).toBeDefined()
    })

    it("requires description and displays validation error", async () => {
      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const form = screen.findForm()
      form.submit()

      expect(mockedCreateTransactionAction).not.toHaveBeenCalled()
      expect(screen.findByText("Description is required")).toBeDefined()
    })

    it("submits transaction with parsed fields on valid submission", async () => {
      const onClose = vi.fn()
      mockedCreateTransactionAction.mockResolvedValueOnce({ ok: true, id: "txn_123" })

      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const descInput = screen.findByPlaceholder("AWS Infrastructure, Client Retainer")
      descInput.change("Client Advisory Retainer")

      const inputs = screen.findAllInputs()
      const typeSelect = inputs.find((i) => i.element.type === "select" && i.props.value === "expense")
      typeSelect?.change("income")

      const amountInput = inputs.find((i) => i.props.type === "number")
      amountInput?.change("4500.50")

      const categoryInput = screen.findByPlaceholder("Software, Payroll")
      categoryInput.change("Consulting")

      const accountInput = screen.findByPlaceholder("Operating, Payroll")
      accountInput.change("Treasury")

      const form = screen.findForm()
      await form.submit()

      expect(mockedCreateTransactionAction).toHaveBeenCalledWith("company-1", {
        description: "Client Advisory Retainer",
        amount: 4500.5,
        type: "income",
        category: "Consulting",
        status: "cleared",
        account: "Treasury",
      })
      expect(onClose).toHaveBeenCalled()
    })

    it("supports Ctrl+Enter keyboard shortcut for submission", async () => {
      const onClose = vi.fn()
      mockedCreateTransactionAction.mockResolvedValueOnce({ ok: true, id: "txn_ctrl" })

      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const descInput = screen.findByPlaceholder("AWS Infrastructure, Client Retainer")
      descInput.change("Figma License")

      const form = screen.findForm()
      await form.keyDown({ key: "Enter", ctrlKey: true })

      expect(mockedCreateTransactionAction).toHaveBeenCalledWith("company-1", {
        description: "Figma License",
        amount: 0,
        type: "expense",
        category: "General",
        status: "cleared",
        account: "Operating",
      })
      expect(onClose).toHaveBeenCalled()
    })

    it("displays error returned by createTransactionAction", async () => {
      mockedCreateTransactionAction.mockResolvedValueOnce({
        ok: false,
        error: "Transaction validation failed",
      })

      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const descInput = screen.findByPlaceholder("AWS Infrastructure, Client Retainer")
      descInput.change("Hosting")

      const form = screen.findForm()
      await form.submit()

      expect(screen.findByText("Transaction validation failed")).toBeDefined()
    })

    it("handles unexpected thrown errors from createTransactionAction", async () => {
      mockedCreateTransactionAction.mockRejectedValueOnce(new Error("Disk full"))

      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const descInput = screen.findByPlaceholder("AWS Infrastructure, Client Retainer")
      descInput.change("Hosting")

      const form = screen.findForm()
      await form.submit()

      expect(screen.findByText("Disk full")).toBeDefined()
    })

    it("falls back to General category and 0 amount when input is empty or invalid", async () => {
      mockedCreateTransactionAction.mockResolvedValueOnce({ ok: true, id: "txn_fb" })

      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const descInput = screen.findByPlaceholder("AWS Infrastructure, Client Retainer")
      descInput.change("Minimal Transaction")

      const inputs = screen.findAllInputs()
      const amountInput = inputs.find((i) => i.props.type === "number")
      amountInput?.change("-10")

      const categoryInput = screen.findByPlaceholder("Software, Payroll")
      categoryInput.change("   ")

      const accountInput = screen.findByPlaceholder("Operating, Payroll")
      accountInput.change("   ")

      const form = screen.findForm()
      await form.submit()

      expect(mockedCreateTransactionAction).toHaveBeenCalledWith("company-1", {
        description: "Minimal Transaction",
        amount: 0,
        type: "expense",
        category: "General",
        status: "cleared",
        account: "Operating",
      })
    })

    it("disables buttons while transaction action is in flight", async () => {
      let resolveAction!: (val: { ok: true; id: string }) => void
      mockedCreateTransactionAction.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAction = resolve
        })
      )

      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const descInput = screen.findByPlaceholder("AWS Infrastructure, Client Retainer")
      descInput.change("Slow Txn")

      const form = screen.findForm()
      const submitPromise = form.submit()

      const buttons = screen.findAllButtons()
      const cancelBtn = buttons.find((b) => getText(b.element) === "Cancel")
      const saveBtn = buttons.find((b) => getText(b.element).includes("Save & Commit"))

      expect(cancelBtn?.props.disabled).toBe(true)
      expect(saveBtn?.props.disabled).toBe(true)

      resolveAction({ ok: true, id: "txn_slow" })
      await submitPromise
    })

    it("calls onClose when Cancel button is clicked", () => {
      const onClose = vi.fn()
      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const cancelBtn = screen.findByText("Cancel")
      cancelBtn.click()
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("guards onOpenChange from triggering onClose while loading", async () => {
      const onClose = vi.fn()
      let resolveAction!: (val: { ok: true; id: string }) => void
      mockedCreateTransactionAction.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAction = resolve
        })
      )

      render(
        React.createElement(AddTransactionModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const dialog = screen.findDialog()
      const onOpenChange = dialog.props["data-on-open-change"] as (open: boolean) => void

      // When not loading, closing triggers onClose
      onOpenChange(false)
      expect(onClose).toHaveBeenCalledTimes(1)
      onClose.mockClear()

      // Fill and submit form to enter loading state
      const descInput = screen.findByPlaceholder("AWS Infrastructure, Client Retainer")
      descInput.change("Slow Txn")

      const form = screen.findForm()
      const submitPromise = form.submit()

      // While loading, onOpenChange(false) should NOT call onClose
      const dialogLoading = screen.findDialog()
      const onOpenChangeLoading = dialogLoading.props["data-on-open-change"] as (open: boolean) => void
      onOpenChangeLoading(false)
      expect(onClose).not.toHaveBeenCalled()

      resolveAction({ ok: true, id: "txn_slow" })
      await submitPromise
    })
  })

  describe("AddContentModal", () => {
    it("does not render dialog content when isOpen is false", () => {
      const { container } = render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: false,
          onClose: vi.fn(),
        })
      )
      expect(container).toBeNull()
    })

    it("renders title, description, form fields, and default values when isOpen is true", () => {
      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      expect(screen.findByText("Draft New Content")).toBeDefined()
      expect(screen.findByText("Add an idea, draft, or article to your publishing queue.")).toBeDefined()

      const titleInput = screen.findByPlaceholder("Why Local-First AI Matters")
      expect(titleInput.props.value).toBe("")

      const channelInput = screen.findByPlaceholder("blog, twitter, newsletter")
      expect(channelInput.props.value).toBe("blog")

      expect(screen.findByText("Cancel")).toBeDefined()
      expect(screen.findByText("Save & Commit")).toBeDefined()
    })

    it("requires title and displays validation error", async () => {
      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const form = screen.findForm()
      form.submit()

      expect(mockedCreateContentItemAction).not.toHaveBeenCalled()
      expect(screen.findByText("Title is required")).toBeDefined()
    })

    it("submits content item on valid submission", async () => {
      const onClose = vi.fn()
      mockedCreateContentItemAction.mockResolvedValueOnce({ ok: true, id: "content_123" })

      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const titleInput = screen.findByPlaceholder("Why Local-First AI Matters")
      titleInput.change("Autonomous Systems in 2026")

      const channelInput = screen.findByPlaceholder("blog, twitter, newsletter")
      channelInput.change("newsletter")

      const inputs = screen.findAllInputs()
      const typeSelect = inputs.find((i) => i.element.type === "select" && i.props.value === "article")
      typeSelect?.change("newsletter")

      const statusSelect = inputs.find((i) => i.element.type === "select" && i.props.value === "idea")
      statusSelect?.change("draft")

      const form = screen.findForm()
      await form.submit()

      expect(mockedCreateContentItemAction).toHaveBeenCalledWith("company-1", {
        title: "Autonomous Systems in 2026",
        channel: "newsletter",
        type: "newsletter",
        status: "draft",
      })
      expect(onClose).toHaveBeenCalled()
    })

    it("supports Cmd+Enter keyboard shortcut for submission", async () => {
      const onClose = vi.fn()
      mockedCreateContentItemAction.mockResolvedValueOnce({ ok: true, id: "content_cmd" })

      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const titleInput = screen.findByPlaceholder("Why Local-First AI Matters")
      titleInput.change("Weekly Dispatch #42")

      const form = screen.findForm()
      await form.keyDown({ key: "Enter", metaKey: true })

      expect(mockedCreateContentItemAction).toHaveBeenCalledWith("company-1", {
        title: "Weekly Dispatch #42",
        channel: "blog",
        type: "article",
        status: "idea",
      })
      expect(onClose).toHaveBeenCalled()
    })

    it("displays error returned by createContentItemAction", async () => {
      mockedCreateContentItemAction.mockResolvedValueOnce({
        ok: false,
        error: "Failed to parse content items",
      })

      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const titleInput = screen.findByPlaceholder("Why Local-First AI Matters")
      titleInput.change("Test Title")

      const form = screen.findForm()
      await form.submit()

      expect(screen.findByText("Failed to parse content items")).toBeDefined()
    })

    it("handles unexpected thrown errors from createContentItemAction", async () => {
      mockedCreateContentItemAction.mockRejectedValueOnce(new Error("Git mutation timeout"))

      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const titleInput = screen.findByPlaceholder("Why Local-First AI Matters")
      titleInput.change("Test Title")

      const form = screen.findForm()
      await form.submit()

      expect(screen.findByText("Git mutation timeout")).toBeDefined()
    })

    it("falls back to blog channel when channel input is empty", async () => {
      mockedCreateContentItemAction.mockResolvedValueOnce({ ok: true, id: "content_fb" })

      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const titleInput = screen.findByPlaceholder("Why Local-First AI Matters")
      titleInput.change("Channel Fallback")

      const channelInput = screen.findByPlaceholder("blog, twitter, newsletter")
      channelInput.change("   ")

      const form = screen.findForm()
      await form.submit()

      expect(mockedCreateContentItemAction).toHaveBeenCalledWith("company-1", {
        title: "Channel Fallback",
        channel: "blog",
        type: "article",
        status: "idea",
      })
    })

    it("disables buttons while content action is in flight", async () => {
      let resolveAction!: (val: { ok: true; id: string }) => void
      mockedCreateContentItemAction.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAction = resolve
        })
      )

      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      const titleInput = screen.findByPlaceholder("Why Local-First AI Matters")
      titleInput.change("Slow Content")

      const form = screen.findForm()
      const submitPromise = form.submit()

      const buttons = screen.findAllButtons()
      const cancelBtn = buttons.find((b) => getText(b.element) === "Cancel")
      const saveBtn = buttons.find((b) => getText(b.element).includes("Save & Commit"))

      expect(cancelBtn?.props.disabled).toBe(true)
      expect(saveBtn?.props.disabled).toBe(true)

      resolveAction({ ok: true, id: "content_slow" })
      await submitPromise
    })

    it("calls onClose when Cancel button is clicked", () => {
      const onClose = vi.fn()
      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const cancelBtn = screen.findByText("Cancel")
      cancelBtn.click()
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("guards onOpenChange from triggering onClose while loading", async () => {
      const onClose = vi.fn()
      let resolveAction!: (val: { ok: true; id: string }) => void
      mockedCreateContentItemAction.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveAction = resolve
        })
      )

      render(
        React.createElement(AddContentModal, {
          companyId: "company-1",
          isOpen: true,
          onClose,
        })
      )

      const dialog = screen.findDialog()
      const onOpenChange = dialog.props["data-on-open-change"] as (open: boolean) => void

      // When not loading, closing triggers onClose
      onOpenChange(false)
      expect(onClose).toHaveBeenCalledTimes(1)
      onClose.mockClear()

      // Fill and submit form to enter loading state
      const titleInput = screen.findByPlaceholder("Why Local-First AI Matters")
      titleInput.change("Slow Content")

      const form = screen.findForm()
      const submitPromise = form.submit()

      // While loading, onOpenChange(false) should NOT call onClose
      const dialogLoading = screen.findDialog()
      const onOpenChangeLoading = dialogLoading.props["data-on-open-change"] as (open: boolean) => void
      onOpenChangeLoading(false)
      expect(onClose).not.toHaveBeenCalled()

      resolveAction({ ok: true, id: "content_slow" })
      await submitPromise
    })
  })

  describe("Index Exports", () => {
    it("exports all three quick-add modals from index", () => {
      expect(typeof AddLeadModal).toBe("function")
      expect(typeof AddTransactionModal).toBe("function")
      expect(typeof AddContentModal).toBe("function")
    })
  })
})
