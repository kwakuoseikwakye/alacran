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
    SignInButton: (p: { executorId: string }) => h("div", { "data-probe": "sign-in", "data-id": p.executorId }),
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

const executorStatus = (executor: object) =>
  ({
    google: { id: "google", label: "Google", detail: "", guidance: { steps: [] } },
    aiExecutors: [{ id: "claude-code", connected: true }, executor],
  }) as unknown as ConnectStatus

const renderExecutor = (slug: string, executor: object) =>
  renderToStaticMarkup(
    React.createElement(MachineSetupModal, { open: true, onClose: () => {}, slug, name: slug, connectStatus: executorStatus(executor) })
  )

const missing = (id: string, extra: object = {}) => ({
  id,
  label: id,
  connected: false,
  detail: `${id} not found on your PATH.`,
  guidance: { steps: [`Install ${id}, then sign in with your own account.`], command: `install-${id}`, link: `https://example.com/${id}` },
  ...extra,
})

// Every AI executor gets the same assisted setup Claude Code has: an install
// button where a verified installer exists, the command to copy, and the docs.
describe("MachineSetupModal: other AI executors", () => {
  for (const [slug, id] of [["codex", "codex"], ["kiro", "kiro"], ["kimi", "kimi"], ["antigravity", "google-antigravity"]]) {
    it(`${slug}, not installed: shows the steps, the command to copy and the instructions link`, () => {
      const html = renderExecutor(slug, missing(id))
      expect(html).toContain(`Install ${id}, then sign in with your own account.`)
      expect(html).toContain(`install-${id}`)
      expect(html).toContain(`href="https://example.com/${id}"`)
    })
  }

  it("offers Install it for me only where the status carries a verified installer", () => {
    expect(renderExecutor("codex", missing("codex", { installId: "codex" }))).toContain('data-probe="install" data-id="codex"')
    expect(renderExecutor("kimi", missing("kimi"))).not.toContain('data-probe="install"')
  })

  it("installed but signed out: offers Sign in", () => {
    const html = renderExecutor("kiro", missing("kiro", { needsSignIn: true, guidance: { steps: [] } }))
    expect(html).toContain('data-probe="sign-in" data-id="kiro"')
  })

  it("installed and ready: no setup steps", () => {
    const html = renderExecutor("codex", { ...missing("codex", { installId: "codex" }), connected: true })
    expect(html).toContain("CLI Engine Ready")
    expect(html).not.toContain('data-probe="install"')
    expect(html).not.toContain("install-codex")
  })
})
