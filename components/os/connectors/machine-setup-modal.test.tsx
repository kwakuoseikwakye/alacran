import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

// The server actions behind these are not what is under test; the modal's wiring is.
vi.mock("@/lib/setup-google", () => ({ openChromePairing: vi.fn() }))
vi.mock("@/lib/install-tool", () => ({ installTool: vi.fn() }))
vi.mock("@/components/os/connectors/outlook-setup", () => ({ OutlookSetup: () => null }))
vi.mock("@/components/connect-panel", async () => {
  const { createElement: h } = await import("react")
  return {
    ConnectGoogleApps: (p: { accounts: string[]; accountServices?: Record<string, string[]>; claudeReady: boolean }) =>
      h("div", { "data-probe": "apps", "data-accounts": p.accounts.join(","), "data-ready": String(p.claudeReady), "data-scopes": JSON.stringify(p.accountServices ?? null) }),
    GoogleSetup: (p: { stage: string }) => h("div", { "data-probe": "setup", "data-stage": p.stage }),
    InstallButton: (p: { id: string }) => h("div", { "data-probe": "install", "data-id": p.id }),
    KeychainNote: () => h("div", { "data-probe": "keychain" }),
  }
})

import { MachineSetupModal } from "./machine-setup-modal"
import type { ConnectStatus } from "@/lib/connect/connect-status-impl"

const status = (google: object, claudeConnected = true) =>
  ({
    google: { id: "google", label: "Google", detail: "", guidance: { steps: [] }, ...google },
    aiExecutors: [{ id: "claude-code", connected: claudeConnected }],
  }) as unknown as ConnectStatus

const render = (connectStatus: ConnectStatus) =>
  renderToStaticMarkup(
    React.createElement(MachineSetupModal, { open: true, onClose: () => {}, slug: "google", name: "Google Cloud & Workspace", connectStatus })
  )

describe("MachineSetupModal: Google", () => {
  it("connected: shows the add-account flow with every stored account and what each one carries", () => {
    const html = render(
      status({ connected: true, accounts: ["ama@acme-corp.com", "kofi@example.com"], accountServices: { "ama@acme-corp.com": ["gmail"], "kofi@example.com": ["gmail", "drive"] } })
    )
    expect(html).toContain("Connected (2 account(s))")
    expect(html).toContain('data-probe="apps"')
    expect(html).toContain('data-accounts="ama@acme-corp.com,kofi@example.com"')
    expect(html).toContain("&quot;kofi@example.com&quot;:[&quot;gmail&quot;,&quot;drive&quot;]")
    expect(html).toContain('data-ready="true"')
    expect(html).not.toContain('data-probe="setup"')
  })

  it("not connected, client stage: first-time setup, not the add-account flow", () => {
    const html = render(status({ connected: false, googleStage: "client" }))
    expect(html).toContain("Setup required")
    expect(html).toContain('data-probe="setup" data-stage="client"')
    expect(html).not.toContain('data-probe="apps"')
  })

  it("not connected, gog missing: offers the install button", () => {
    const html = render(status({ connected: false, googleStage: "install", installId: "gog" }))
    expect(html).toContain('data-probe="install" data-id="gog"')
    expect(html).not.toContain('data-probe="setup"')
  })

  it("keeps header and footer on screen: the box is bounded and only the body scrolls", () => {
    const html = render(status({ connected: true, accounts: ["ama@acme-corp.com"] }))
    expect(html).toContain("max-h-[90vh]")
    expect(html).toContain("max-w-2xl")
    expect(html).toMatch(/class="min-h-0 flex-1 [^"]*overflow-y-auto"/)
  })
})
