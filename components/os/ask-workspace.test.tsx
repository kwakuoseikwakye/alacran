import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import { AskWorkspace } from "./ask-workspace"
import { Composer } from "./composer"

function findByType(node: unknown, type: unknown): React.ReactElement | null {
  if (Array.isArray(node)) return node.reduce<React.ReactElement | null>((hit, n) => hit ?? findByType(n, type), null)
  if (!React.isValidElement(node)) return null
  return node.type === type ? node : findByType((node.props as { children?: unknown }).children, type)
}

vi.mock("next/link", () => ({ default: "a" }))

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
}))

vi.mock("@/lib/os/records/actions", () => ({
  createLeadAction: vi.fn().mockResolvedValue({ ok: true, id: "lead-1" }),
  createTransactionAction: vi.fn().mockResolvedValue({ ok: true, id: "txn-1" }),
  createContentItemAction: vi.fn().mockResolvedValue({ ok: true, id: "content-1" }),
}))

vi.mock("@/lib/os/doctor/preflight-actions", () => ({
  runPreflightCheckAction: vi.fn().mockResolvedValue({
    ok: true,
    canProceed: true,
    checks: [],
    blockers: [],
    warnings: [],
  }),
}))

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H?: Record<string, unknown>
  }
}

describe("AskWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const reactAny = React as ReactWithInternals
    if (reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE) {
      reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
        useTransition: () => [false, (cb: () => void) => cb()],
        useState: (initial: unknown) => [
          typeof initial === "function" ? (initial as () => unknown)() : initial,
          () => {},
        ],
        useEffect: (cb: () => void | (() => void)) => {
          cb()
        },
      }
    }
  })

  it("renders Ask Alacrán header and action starters", () => {
    const el = AskWorkspace({ companyId: "test-co" })
    expect(el).not.toBeNull()
    const str = JSON.stringify(el)
    expect(str).toContain("What do you want to get done?")
    expect(str).toContain("Add a lead")
    expect(str).toContain("Log money in or out")
    expect(str).toContain("Add a content idea")
  })

  // Its own box was a three-column grid built for an icon that was later
  // removed, so the text field read "Ask". It now asks through the same
  // growing box as Home.
  it("asks through the shared ask box, for this company", () => {
    const box = findByType(AskWorkspace({ companyId: "test-co" }), Composer)
    expect(box).not.toBeNull()
    expect((box?.props as { companyId: string }).companyId).toBe("test-co")
  })

  // These shortcuts once staged made-up records that one click committed into
  // the user's real files.
  it("never pre-fills a record with invented data", () => {
    const str = JSON.stringify(AskWorkspace({ companyId: "test-co" }))
    expect(str).not.toMatch(/Acme|Cloud Server Hosting|AI-Native Operating Systems/)
  })
})
