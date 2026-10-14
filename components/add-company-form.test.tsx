import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/components/advanced-only", () => ({
  useAdvancedMode: () => false,
}))

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? React.createElement("div", { "data-slot": "sheet" }, children) : null,
  SheetContent: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    React.createElement("div", { "data-slot": "sheet-content", className }, children),
  SheetHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-slot": "sheet-header" }, children),
  SheetTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("h2", { "data-slot": "sheet-title" }, children),
  SheetDescription: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("p", { "data-slot": "sheet-description" }, children),
}))

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? React.createElement("div", { "data-slot": "alert-dialog" }, children) : null,
  AlertDialogContent: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("h3", null, children),
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogAction: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    React.createElement("button", { onClick }, children),
  AlertDialogCancel: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    React.createElement("button", { onClick }, children),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) =>
    React.createElement("button", props, children),
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => React.createElement("input", props),
}))

let currentTree: React.ReactNode = null
let hookStates: unknown[] = []
let hookIndex = 0
let renderFn: (() => React.ReactNode) | null = null

function doRender() {
  hookIndex = 0
  if (renderFn) {
    currentTree = renderFn()
  }
}

type ComponentProps = Record<string, unknown>
type ComponentFunction = (props: ComponentProps) => React.ReactNode

function render(element: React.ReactElement) {
  hookStates = []
  hookIndex = 0
  const Comp = element.type as ComponentFunction
  const props = element.props as ComponentProps
  renderFn = () => Comp(props)
  doRender()
  return { container: currentTree }
}

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
  getByRole: (role: string, options?: { name?: RegExp | string }): ElementHandle => {
    const matches = findInTree(currentTree, (el) => {
      const props = (el.props as Record<string, unknown>) || {}
      if (props.role !== role) return false
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
  getAllByText: (matcher: RegExp | string): ElementHandle[] => {
    const matches = findInTree(currentTree, (el) => {
      const text = getText(el)
      if (typeof matcher === "string") {
        return text.includes(matcher)
      }
      return matcher.test(text)
    })
    return matches.map(makeHandle)
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
  getByPlaceholderText: (matcher: RegExp | string): ElementHandle => {
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
}

type ClickTarget = {
  click?: () => void
  props?: {
    onClick?: (e: unknown) => void
    onChange?: (e: unknown) => void
  }
}

const fireEvent = {
  click: (target: ClickTarget) => {
    if (target?.click) {
      target.click()
    } else if (target?.props?.onClick) {
      target.props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() })
    }
  },
  change: (target: ClickTarget, event: { target: { value: string } }) => {
    const changeFn = target?.props?.onChange as ((e: unknown) => void) | undefined
    if (changeFn) {
      changeFn(event)
    }
  },
}

vi.mock("@testing-library/react", () => ({
  render,
  screen,
  fireEvent,
}))

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H?: Record<string, unknown>
  }
}
const internals = (React as unknown as ReactWithInternals).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE

beforeEach(() => {
  if (internals) {
    internals.H = {
      useState: (initial: unknown) => {
        const idx = hookIndex++
        if (hookStates.length <= idx) {
          hookStates[idx] = typeof initial === "function" ? (initial as () => unknown)() : initial
        }
        const setState = (newVal: unknown) => {
          hookStates[idx] = typeof newVal === "function" ? (newVal as (prev: unknown) => unknown)(hookStates[idx]) : newVal
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

import { AddCompanyForm } from "./add-company-form"

describe("AddCompanyForm", () => {
  it("renders 3 onboarding mode tabs (New Company, Adopt Folder, Restore)", () => {
    render(<AddCompanyForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole("tab", { name: /new company/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /adopt folder/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /restore backup/i })).toBeDefined()
  })

  it("switches to Adopt Folder view when clicked", () => {
    render(<AddCompanyForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
    const adoptTab = screen.getByRole("tab", { name: /adopt folder/i })
    fireEvent.click(adoptTab)
    expect(screen.getByText(/safely adds alacrán context/i)).toBeDefined()
  })

  it("switches to Restore Backup view when clicked", () => {
    render(<AddCompanyForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
    const restoreTab = screen.getByRole("tab", { name: /restore backup/i })
    fireEvent.click(restoreTab)
    expect(screen.getByText(/github repository url/i)).toBeDefined()
    expect(screen.getByText(/clones a company you previously backed up/i)).toBeDefined()
  })

  it("renders Bento Cards with category badges, role tags, and §6 human gate badge", () => {
    render(<AddCompanyForm onSuccess={vi.fn()} onCancel={vi.fn()} />)
    // Category badges
    expect(screen.getByText(/Engineering/)).toBeDefined()
    expect(screen.getByText(/Sales/)).toBeDefined()
    expect(screen.getByText(/Marketing/)).toBeDefined()
    expect(screen.getByText(/Support/)).toBeDefined()

    // Role tags
    expect(screen.getByText(/Tech Lead/)).toBeDefined()
    expect(screen.getByText(/Software Engineer/)).toBeDefined()
    expect(screen.getByText(/Head of Sales/)).toBeDefined()

    // Human Gate badges, in words a non-technical founder reads
    const gateBadges = screen.getAllByText(/Asks before anything risky/)
    expect(gateBadges.length).toBeGreaterThanOrEqual(6)
  })

  it("invokes onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn()
    render(<AddCompanyForm onSuccess={vi.fn()} onCancel={onCancel} />)
    const cancelBtn = screen.getByText(/^cancel$/i)
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("renders inline prominent mode with scroll containment when prominent=true", () => {
    render(<AddCompanyForm prominent defaultOpen />)
    expect(screen.getByRole("tab", { name: /new company/i })).toBeDefined()
    expect(screen.getByText(/starter template/i)).toBeDefined()
  })

  it("switching from Adopt Folder back to New Company auto-derives rootPath when a company name is entered", () => {
    render(<AddCompanyForm homeDir="/Users/test" onSuccess={vi.fn()} onCancel={vi.fn()} />)

    // Switch to Adopt Folder
    const adoptTab = screen.getByRole("tab", { name: /adopt folder/i })
    fireEvent.click(adoptTab)
    expect(screen.getByText(/safely adds alacrán context/i)).toBeDefined()

    // Switch back to New Company
    const newTab = screen.getByRole("tab", { name: /new company/i })
    fireEvent.click(newTab)

    // Type company name
    const nameInput = screen.getByPlaceholderText(/ama.s catering/i)
    fireEvent.change(nameInput, { target: { value: "Alpha Corp" } })

    // "Add company" button should be enabled because rootPath was auto-derived from suggestedPath
    const submitBtn = screen.getByText(/^add company$/i)
    expect(submitBtn.props.disabled).toBe(false)
  })

  it("switching to Restore Backup auto-derives rootPath when a company name is entered", () => {
    render(<AddCompanyForm homeDir="/Users/test" onSuccess={vi.fn()} onCancel={vi.fn()} />)

    // Switch to Restore Backup
    const restoreTab = screen.getByRole("tab", { name: /restore backup/i })
    fireEvent.click(restoreTab)

    // Type company name
    const nameInput = screen.getByPlaceholderText(/restored company/i)
    fireEvent.change(nameInput, { target: { value: "Beta Corp" } })

    // Type repository URL
    const urlInput = screen.getByPlaceholderText(/github\.com/i)
    fireEvent.change(urlInput, { target: { value: "https://github.com/my-org/beta-corp" } })

    // "Restore company" button should be enabled because rootPath was auto-derived from suggestedPath
    const restoreBtn = screen.getByText(/^restore company$/i)
    expect(restoreBtn.props.disabled).toBe(false)
  })
})
