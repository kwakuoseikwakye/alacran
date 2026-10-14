import { describe, expect, it, vi } from "vitest"
import React from "react"
globalThis.React = React
import { renderToStaticMarkup } from "react-dom/server"
import { NexusView, type NexusViewProps } from "./nexus-view"
import { DEFAULT_PREFS } from "@/lib/voice/agent/agent-preferences"
import type { AgentDisplay } from "@/lib/voice/agent/agent-state"

// The proposal cards pull in server actions and next/navigation (same mocks as proposal-card.test.tsx).
vi.mock("@/lib/os/records/actions", () => ({ createLeadAction: vi.fn(), createTransactionAction: vi.fn(), createContentItemAction: vi.fn() }))
vi.mock("@/lib/os/doctor/preflight-actions", () => ({ runPreflightCheckAction: vi.fn() }))
vi.mock("@/lib/company-commands/run-company-command", () => ({ runCompanyCommand: vi.fn() }))
vi.mock("@/lib/os/departments/actions", () => ({
  createDepartmentAction: vi.fn(), retryCommitAction: vi.fn(),
  editDepartmentAction: vi.fn(), getDepartmentForEditAction: vi.fn(), planRemovalAction: vi.fn(), removeDepartmentAction: vi.fn(),
}))
vi.mock("@/lib/run-verify", () => ({ runCompanyVerify: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const noop = () => {}
const DISPLAYS: AgentDisplay[] = ["idle", "connecting", "listening", "thinking", "speaking", "checking", "reconnecting"]

function view(over: Partial<NexusViewProps> = {}) {
  const props: NexusViewProps = {
    name: "Jarvis", display: "idle", lines: [], toolFeed: [], liveYou: "", error: null, micNote: "", canFixMic: false, onFixMic: noop,
    talking: false, prefs: DEFAULT_PREFS, calm: false, focus: false, panel: "none", typed: "",
    companies: [{ id: "acme", name: "Acme" }], levelRef: { current: 0 }, binsRef: { current: null },
    onTyped: noop, onSend: noop, onToggleMic: noop, onPanel: noop, onFocus: noop, onPrefs: noop, onClose: noop,
    ...over,
  }
  return renderToStaticMarkup(<NexusView {...props} />)
}

const proposal = (label: string) => ({ companyId: "acme", commandId: "digest", label, fields: {} })

describe("NexusView", () => {
  it("never says call, in any state, panel or mic state", () => {
    for (const display of DISPLAYS)
      for (const panel of ["none", "conversation", "settings"] as const)
        for (const talking of [true, false])
          expect(view({ display, panel, talking })).not.toMatch(/\bcall/i)
  })
  it("shows the assistant's own name as the wordmark, and its greeting before anything is said", () => {
    const html = view()
    expect(html).toContain(">JARVIS<")
    expect(html).toContain("PERSONAL INTELLIGENCE")
    expect(html).toContain("Hello. I’m Jarvis. What’s on your mind?")
    expect(html).toContain('placeholder="Say something to Jarvis…"')
  })
  it("has one voice control, a mic switch: tap to turn it on, tap again to turn it off", () => {
    const off = view()
    expect(off).toContain('aria-label="Turn the mic on"')
    expect(off).toContain('aria-pressed="false"')
    expect(off).not.toMatch(/Hold to talk|Push-to-talk/)
    expect(view({ talking: true })).toContain('aria-label="Turn the mic off"')
  })
  it("shows a proposal the moment it arrives, even before the assistant says anything after it", () => {
    const lines = [
      { id: 1, role: "assistant" as const, text: "Let me put that on screen." },
      { id: 2, role: "assistant" as const, text: "", proposal: proposal("Run the digest") },
    ]
    const html = view({ lines })
    expect(html).toMatch(/class="nx-card".*Run the digest/)
    expect(html).toContain("Let me put that on screen.")
  })
  it("says it is waking up while it connects", () => {
    expect(view({ display: "connecting" })).toContain("WAKING UP")
  })
  it("marks the current presence state as indicators, not buttons", () => {
    const html = view({ display: "speaking" })
    expect(html).toMatch(/<li class="nx-mode" aria-current="true">.*?Speaking/)
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
  })
  it("offers the three suggestions", () => {
    const html = view()
    for (const s of ["Brief me", "Set up my company", "Check my messages"]) expect(html).toContain(`${s}</button>`)
  })
  it("puts the newest proposal above the message box, and never renders that same card in the drawer", () => {
    const lines = [
      { id: 1, role: "assistant" as const, text: "One", proposal: proposal("Older card") },
      { id: 2, role: "assistant" as const, text: "Two", proposal: proposal("Newest card") },
    ]
    const closed = view({ lines })
    expect(closed).toMatch(/class="nx-card".*Newest card/)
    expect(closed).not.toContain("Older card")
    const open = view({ lines, panel: "conversation" })
    expect(open.match(/Newest card/g)).toHaveLength(1)
    expect(open).toContain("Older card")
  })
  it("never offers a card's button again once the owner acted on it, in the slot or the drawer", () => {
    const lines = [
      { id: 1, role: "assistant" as const, text: "One", proposal: proposal("Older card") },
      { id: 2, role: "assistant" as const, text: "Two", proposal: proposal("Newest card") },
    ]
    const html = view({ lines, panel: "conversation", actedIds: new Set([1, 2]) })
    expect(html).not.toContain("Older card")
    expect(html).not.toContain("Newest card")
    expect(html.match(/You already acted on this\./g)).toHaveLength(2)
    expect(view({ lines, panel: "conversation", actedIds: new Set([1]) })).toContain("Newest card")
  })
  it("opens the conversation drawer and the settings popover as labelled dialogs", () => {
    const convo = view({ panel: "conversation", lines: [{ id: 1, role: "you", text: "Hi" }] })
    expect(convo).toContain('role="dialog" aria-label="Conversation"')
    expect(convo).toContain("WHAT I LOOKED UP")
    const settings = view({ panel: "settings" })
    expect(settings).toContain('role="dialog" aria-label="Settings"')
    expect(settings).toContain("Longest conversation (minutes)")
    expect(settings).toContain('aria-label="Ion colour"')
    expect(view()).not.toContain('role="dialog"')
  })
  it("marks focus view and applies the chosen colour", () => {
    expect(view({ focus: true })).toContain('data-focus="true"')
    expect(view({ prefs: { ...DEFAULT_PREFS, palette: "solar" } })).toContain("--nx-accent:#f0c28a")
  })
  it("shows an error as an alert, with the microphone fix when it can help", () => {
    const html = view({ error: "Microphone blocked.", canFixMic: true })
    expect(html).toContain('role="alert"')
    expect(html).toContain("Fix microphone access")
  })
})
