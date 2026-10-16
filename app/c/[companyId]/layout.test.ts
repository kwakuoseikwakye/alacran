import { describe, it, expect, vi } from "vitest"
import React, { type ReactElement } from "react"
// Classic JSX transform (this repo's vitest config has no React plugin) needs
// `React` in global scope — same fix components/add-company-form.test.tsx uses.
globalThis.React = React

/**
 * `CompanyLayout` is an async Server Component — calling it directly returns
 * a plain React element tree (an object graph), never renders. That's enough
 * to inspect the `assistant` prop it hands to `<Shell>` without touching
 * jsdom or React's renderer at all.
 */

const COMPANY_PERSONA = {
  assistantName: "Acme Assistant",
  userName: "Alex",
  spokenLanguage: "en-US",
  replyLanguage: "en-US",
  voiceURI: "",
}

const resolvePersonaMock = vi.fn(async (agentRootPath: string | null) => {
  if (agentRootPath === "/companies/acme") {
    return { persona: COMPANY_PERSONA, source: "company" as const }
  }
  return { persona: null, source: "unset" as const }
})

vi.mock("@/lib/assistant/resolve-persona", () => ({
  resolvePersona: (agentRootPath: string | null) => resolvePersonaMock(agentRootPath),
}))

vi.mock("@/lib/get-effective-agents", () => ({
  getEffectiveAgents: async () => [
    { id: "acme", name: "Acme", rootPath: "/companies/acme", kind: "command-set" },
  ],
}))

// Hermetic badge inputs: one review for this company, one for another, and a waiting guide update.
vi.mock("@/lib/company-commands/pending-reviews", () => ({
  listPendingReviews: async () => [
    { agentId: "acme", commandId: "digest" },
    { agentId: "other", commandId: "digest" },
  ],
}))

vi.mock("@/lib/guide/observe", () => ({ guidePendingCount: async () => 1 }))
vi.mock("@/lib/jobs/view", () => ({ openFlagCount: async () => 0 }))

let agentReady = false
vi.mock("@/lib/voice/settings-impl", () => ({
  // The machine has no persona at all here — proves the company's own
  // persona (via resolvePersona) is what actually reaches the page, not a
  // machine one that happens to be unset too.
  readVoiceSettingsViewImpl: async () => ({
    providerId: "browser",
    hasKey: false,
    persona: null,
    assistantExecutorId: "claude-code",
    elevenlabsAgentReady: agentReady,
    elevenlabsVoiceId: null,
  }),
}))

const { default: CompanyLayout } = await import("./layout")

function findShellProps(element: unknown): Record<string, unknown> | undefined {
  if (!element || typeof element !== "object") return undefined
  const el = element as ReactElement & { props?: Record<string, unknown> }
  if (typeof el.type === "function" && el.type.name === "Shell") return el.props
  const children = el.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findShellProps(child)
      if (found) return found
    }
  } else if (children) {
    return findShellProps(children)
  }
  return undefined
}

describe("CompanyLayout", () => {
  it("resolves the company's own persona instead of the machine's, so needsSetup isn't wrongly triggered", async () => {
    const element = await CompanyLayout({
      children: null,
      params: Promise.resolve({ companyId: "acme" }),
    })

    expect(resolvePersonaMock).toHaveBeenCalledWith("/companies/acme")

    const shellProps = findShellProps(element)
    expect(shellProps).toBeDefined()
    const assistant = shellProps?.assistant as { persona: unknown }
    // needsSetup in AssistantStage is `persona === null` — this is the
    // exact value that decision is made from.
    expect(assistant.persona).toEqual(COMPANY_PERSONA)
    expect(assistant.persona).not.toBeNull()
  })

  it("counts this company's command reviews plus a waiting guide update in the badge, and not another company's", async () => {
    const element = await CompanyLayout({
      children: null,
      params: Promise.resolve({ companyId: "acme" }),
    })

    // One acme review + the guide. The other company's review is not this badge's.
    expect(findShellProps(element)?.pendingReviews).toBe(2)
  })

  it("passes elevenlabsAgentReady through to the dock, false by default", async () => {
    const read = async () => {
      const element = await CompanyLayout({ children: null, params: Promise.resolve({ companyId: "acme" }) })
      const assistant = findShellProps(element)?.assistant as { elevenlabsAgentReady: unknown } | undefined
      expect(assistant).toBeDefined()
      return assistant?.elevenlabsAgentReady
    }
    expect(await read()).toBe(false)
    agentReady = true
    expect(await read()).toBe(true)
    agentReady = false
  })
})
