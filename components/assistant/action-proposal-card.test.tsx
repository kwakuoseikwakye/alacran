import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import { ActionProposalCard } from "./action-proposal-card"
import { runCompanyCommand } from "@/lib/company-commands/run-company-command"
import { runPreflightCheckAction } from "@/lib/os/doctor/preflight-actions"

vi.mock("@/lib/os/records/actions", () => ({
  createLeadAction: vi.fn(),
  createTransactionAction: vi.fn(),
  createContentItemAction: vi.fn(),
}))

vi.mock("@/lib/os/doctor/preflight-actions", () => ({
  runPreflightCheckAction: vi.fn(),
}))

vi.mock("@/lib/company-commands/run-company-command", () => ({
  runCompanyCommand: vi.fn(),
}))

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: {
    H?: Record<string, unknown>
  }
}

/** Find the first element of a given tag in a rendered tree (the test harness renders the component as a plain function). */
function findTag(node: unknown, tag: string): { props: { onClick?: () => void } } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findTag(child, tag)
      if (hit) return hit
    }
    return null
  }
  if (!node || typeof node !== "object") return null
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type === tag) return el as { props: { onClick?: () => void } }
  return findTag(el.props?.children, tag)
}

const FOUR = { domain: "Posters", stakeholders: "Bands", valueFlow: "In, print, out", bottleneck: "Proofs" }

describe("ActionProposalCard", () => {
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

  it("renders a record mutation card with Save record button", () => {
    const el = ActionProposalCard({
      proposal: {
        companyId: "test-co",
        commandId: "create_lead",
        actionType: "create_lead",
        label: "Add Sales Lead: Acme Corp",
        fields: { name: "Acme Corp", value: "10000" },
      },
    })
    expect(el).not.toBeNull()
    const str = JSON.stringify(el)
    expect(str).toContain("Save a record")
    expect(str).toContain("Save record")
    expect(str).toContain("Acme Corp")
  })

  it("renders an agent command card with Prepare draft button", () => {
    const el = ActionProposalCard({
      proposal: {
        companyId: "test-co",
        commandId: "digest",
        actionType: "command",
        label: "Weekly Digest",
        fields: { period: "last 7 days" },
      },
    })
    expect(el).not.toBeNull()
    const str = JSON.stringify(el)
    expect(str).toContain("Prepare a draft")
    expect(str).toContain("Prepare draft")
  })

  it("shows the four define-company answers as editable boxes, with a plain note that nothing is saved yet", () => {
    const el = ActionProposalCard({
      proposal: {
        companyId: "test-co",
        commandId: "define-company",
        label: "Define Test Co",
        fields: { domain: "Posters", stakeholders: "Bands", valueFlow: "In, print, out", bottleneck: "Proofs" },
      },
    })
    const str = JSON.stringify(el)
    expect(str).toContain("textarea")
    expect(str).toContain("What the business does")
    expect(str).toContain("Biggest bottleneck")
    expect(str).toContain("Nothing is saved until you approve the draft")
  })

  it("tells the owner a draft uses their connected AI on every command card, but not on a record card", () => {
    const card = (commandId: string, actionType?: "create_lead" | "command", fields: Record<string, string> = { period: "7 days" }) =>
      JSON.stringify(
        ActionProposalCard({ proposal: { companyId: "test-co", commandId, actionType, label: "Something", fields } })
      )
    for (const commandId of ["digest", "check-inbox", "handoff", "refresh"]) {
      expect(card(commandId, "command"), commandId).toContain("Preparing the draft uses your connected AI.")
    }
    expect(card("define-company", undefined, FOUR)).toContain("Preparing the draft uses your connected AI.")
    expect(card("create_lead", "create_lead", { name: "Acme", value: "1" })).not.toContain("connected AI")
  })

  it("keeps the 'nothing is saved' line on the define-company card only", () => {
    const str = (commandId: string) =>
      JSON.stringify(
        ActionProposalCard({ proposal: { companyId: "test-co", commandId, label: "Something", fields: commandId === "define-company" ? FOUR : { period: "7 days" } } })
      )
    expect(str("define-company")).toContain("Nothing is saved until you approve the draft in Pending Reviews.")
    expect(str("digest")).not.toContain("Nothing is saved")
  })

  it("keeps other commands read-only", () => {
    const el = ActionProposalCard({
      proposal: { companyId: "test-co", commandId: "digest", label: "Weekly Digest", fields: { period: "7 days" } },
    })
    expect(JSON.stringify(el)).not.toContain("textarea")
  })

  it("caps each define-company box at 2000 characters", () => {
    const el = ActionProposalCard({
      proposal: { companyId: "test-co", commandId: "define-company", label: "Define Test Co", fields: FOUR },
    })
    expect(JSON.stringify(el)).toContain('"maxLength":2000')
  })

  it("drops a stray field from a define-company proposal, so the run is not rejected for an unknown field", async () => {
    vi.mocked(runPreflightCheckAction).mockResolvedValue({ canProceed: true } as never)
    vi.mocked(runCompanyCommand).mockResolvedValue({ started: true } as never)
    const el = ActionProposalCard({
      proposal: {
        companyId: "test-co",
        commandId: "define-company",
        label: "Define Test Co",
        fields: { ...FOUR, company: "Test Co" },
      },
    })
    const button = findTag(el, "button")
    expect(button?.props.onClick).toBeTypeOf("function")
    button!.props.onClick!()
    await new Promise((r) => setTimeout(r, 0))
    expect(runCompanyCommand).toHaveBeenCalledWith("define-company", FOUR, "test-co")
  })

  it("keeps every field of a proposal that is not define-company", async () => {
    vi.mocked(runPreflightCheckAction).mockResolvedValue({ canProceed: true } as never)
    vi.mocked(runCompanyCommand).mockResolvedValue({ started: true } as never)
    const el = ActionProposalCard({
      proposal: { companyId: "test-co", commandId: "digest", label: "Weekly Digest", fields: { period: "7 days", extra: "x" } },
    })
    findTag(el, "button")!.props.onClick!()
    await new Promise((r) => setTimeout(r, 0))
    expect(runCompanyCommand).toHaveBeenCalledWith("digest", { period: "7 days", extra: "x" }, "test-co")
  })

  it("disables the button and says why while any define-company box is blank", () => {
    const { bottleneck: _omit, ...three } = FOUR
    void _omit
    const el = ActionProposalCard({
      proposal: { companyId: "test-co", commandId: "define-company", label: "Define Test Co", fields: three },
    })
    const str = JSON.stringify(el)
    expect(str).toContain('"disabled":true')
    expect(str).toContain("Fill in every box first")
  })

  it("enables the button once all four define-company boxes are filled", () => {
    const el = ActionProposalCard({
      proposal: { companyId: "test-co", commandId: "define-company", label: "Define Test Co", fields: FOUR },
    })
    const str = JSON.stringify(el)
    expect(str).not.toContain('"disabled":true')
    expect(str).not.toContain("Fill in every box first")
  })
})
