import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MachineSetupModal } from "./machine-setup-modal"
import { UnifiedConnectionsBoard } from "./unified-connections-board"
import { ConnectionCard } from "./connection-card"
import { recheckAllConnectionsState } from "@/lib/connect/connect-actions"
import type { ConnectStatus } from "@/lib/connect/connect-status-impl"
import type { CatalogEntry } from "@/lib/os/connectors/integrations-catalog"

globalThis.React = React
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/components/advanced-only", () => ({ useAdvancedMode: () => false }))
vi.mock("@/lib/connect/connect-actions", () => ({ recheckAllConnectionsState: vi.fn() }))
vi.mock("@/lib/setup-google", () => ({ openChromePairing: vi.fn() }))
vi.mock("@/lib/install-tool", () => ({ installTool: vi.fn() }))

// Exercise real component callbacks and state without a browser or real probes.
// Child components remain elements, so each harness owns only its root's hooks.
const internals = (React as unknown as {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown }
}).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
let savedDispatcher: unknown
beforeEach(() => { savedDispatcher = internals.H; vi.clearAllMocks() })
afterEach(() => { internals.H = savedDispatcher })

function mount<P extends object>(Component: (props: P) => React.ReactNode, initialProps: P) {
  const states: unknown[] = []
  let index = 0
  let tree: React.ReactNode
  let props = initialProps
  const render = () => {
    index = 0
    internals.H = {
      useState(initial: unknown) {
        const slot = index++
        if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial
        return [states[slot], (value: unknown) => {
          states[slot] = typeof value === "function" ? value(states[slot]) : value
          render()
        }]
      },
      useRef: (value: unknown) => {
        const slot = index++
        if (!(slot in states)) states[slot] = { current: value }
        return states[slot]
      },
    }
    tree = Component(props)
  }
  render()
  return {
    nodes: () => walk(tree),
    update(next: P) { props = next; render() },
  }
}

type TestElement = React.ReactElement<Record<string, unknown>>
function walk(node: React.ReactNode): TestElement[] {
  if (Array.isArray(node)) return node.flatMap(walk)
  if (!React.isValidElement(node)) return []
  const element = node as TestElement
  return [element, ...walk(element.props.children as React.ReactNode)]
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("")
  if (React.isValidElement(node)) return text((node.props as { children?: React.ReactNode }).children)
  return typeof node === "string" || typeof node === "number" ? String(node) : ""
}
function button(view: { nodes(): TestElement[] }, label: string) {
  const found = view.nodes().find((node) => typeof node.props.onClick === "function" && text(node) === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}
const click = (node: TestElement) => (node.props.onClick as () => Promise<void>)()
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

const probe = (id: string, connected = false) => ({ id, label: id, connected, detail: "", guidance: { steps: [] } })
function status(connected = false): ConnectStatus {
  return {
    aiExecutors: [probe("claude-code"), probe("kiro"), probe("kimi"), probe("google-antigravity")],
    google: probe("google"), github: probe("github", connected), beeper: probe("beeper"), outlook: probe("outlook"),
    notion: { companies: [] }, departmentConnectors: [],
  } as ConnectStatus
}
const entry = (connected = false): CatalogEntry => ({ slug: "github", name: "GitHub", tagline: "Repositories", category: "Developer", mechanism: "cli", connected, keySaved: false, popular: true })
const modalProps = (onRecheck: () => Promise<void>) => ({ open: true, onClose: vi.fn(), slug: "github", name: "GitHub", connectStatus: status(), onRecheck })

describe("Connected Tools modal interactions", () => {
  it("shows progress, disables the check while running and confirms completion", async () => {
    const check = deferred()
    const onRecheck = vi.fn(() => check.promise)
    const view = mount(MachineSetupModal, modalProps(onRecheck))
    const pending = click(button(view, "Re-check status"))
    expect(onRecheck).toHaveBeenCalledOnce()
    expect(button(view, "Checking…").props.disabled).toBe(true)
    check.resolve()
    await pending
    expect(button(view, "Re-check status").props.disabled).toBe(false)
    expect(view.nodes().some((node) => node.props.role === "status" && text(node).includes("Status checked"))).toBe(true)
  })

  it("shows a failed check inside the modal and lets the owner retry", async () => {
    const onRecheck = vi.fn().mockRejectedValueOnce(new Error("Probe failed")).mockResolvedValueOnce(undefined)
    const view = mount(MachineSetupModal, modalProps(onRecheck))
    await click(button(view, "Re-check status"))
    expect(view.nodes().some((node) => node.props.role === "alert" && text(node).includes("Could not re-check"))).toBe(true)
    expect(button(view, "Re-check status").props.disabled).toBe(false)
    await click(button(view, "Re-check status"))
    expect(view.nodes().some((node) => node.props.role === "alert")).toBe(false)
  })

  it.each(["kiro", "kimi", "antigravity"])("shows the measured status for %s", (slug) => {
    const props = { ...modalProps(vi.fn()), slug }
    const view = mount(MachineSetupModal, props)
    expect(view.nodes().some((node) => text(node) === "Not connected")).toBe(true)
    expect(view.nodes().some((node) => text(node) === "CLI Engine Ready")).toBe(false)
    const connectStatus = status()
    connectStatus.aiExecutors.find((tool) => tool.id === (slug === "antigravity" ? "google-antigravity" : slug))!.connected = true
    view.update({ ...props, connectStatus })
    expect(view.nodes().some((node) => text(node) === "CLI Engine Ready")).toBe(true)
  })
})

describe("Connected Tools board re-check", () => {
  it("opens the board's selected modal from a tool card without mounting a second dialog", async () => {
    const onOpenMachineSetup = vi.fn()
    const view = mount(ConnectionCard, { entry: entry(), connectStatus: status(), onOpenMachineSetup })
    await click(button(view, "+ Connect"))
    expect(onOpenMachineSetup).toHaveBeenCalledWith("github")
    expect(view.nodes().some((node) => node.type === MachineSetupModal)).toBe(false)
  })

  // Codex was left off the card's list of setup-window tools, so its card had no
  // button at all: not installed, there was no way to reach Install or the command.
  it("gives every AI executor's card a button that opens its setup window", async () => {
    for (const slug of ["claude-code", "codex", "kiro", "kimi", "antigravity"]) {
      const onOpenMachineSetup = vi.fn()
      const view = mount(ConnectionCard, { entry: { ...entry(), slug, name: slug }, connectStatus: status(), onOpenMachineSetup })
      await click(button(view, "+ Connect"))
      expect(onOpenMachineSetup).toHaveBeenCalledWith(slug)
    }
  })

  it("keeps a selected tool's modal open and updates its status when it moves into Your tools", async () => {
    vi.mocked(recheckAllConnectionsState).mockResolvedValue({ connectStatus: status(true), catalog: [entry(true)] })
    const view = mount(UnifiedConnectionsBoard, { initialConnectStatus: status(), initialCatalog: [entry()] })
    const card = view.nodes().find((node) => node.type === ConnectionCard && (node.props.entry as CatalogEntry).slug === "github")!
    expect(card.props.onOpenMachineSetup).toBeTypeOf("function")
    ;(card.props.onOpenMachineSetup as (slug: string) => void)("github")
    const modal = () => view.nodes().find((node) => node.type === MachineSetupModal && node.props.open)!
    expect(modal().props.slug).toBe("github")
    await (modal().props.onRecheck as () => Promise<void>)()
    expect(modal().props.slug).toBe("github")
    expect((modal().props.connectStatus as ConnectStatus).github.connected).toBe(true)
    expect(view.nodes().filter((node) => node.type === MachineSetupModal && node.props.open)).toHaveLength(1)
  })

  it("propagates a failed modal check and retains the board error for its own check button", async () => {
    vi.mocked(recheckAllConnectionsState).mockRejectedValue(new Error("Probe failed"))
    const view = mount(UnifiedConnectionsBoard, { initialConnectStatus: status(), initialCatalog: [entry()] })
    const card = view.nodes().find((node) => node.type === ConnectionCard)!
    await expect((card.props.onRecheck as () => Promise<void>)()).rejects.toThrow("Probe failed")
    expect(view.nodes().some((node) => text(node).includes("Failed to re-check connections"))).toBe(true)
    // The page-level button handles its own rejection instead of leaking an unhandled promise.
    const header = view.nodes().find((node) => node.props.right)!
    const topButton = walk(header.props.right as React.ReactNode).find((node) => text(node) === "Re-check" && node.props.onClick)!
    await expect(click(topButton)).resolves.toBeUndefined()
  })
})
