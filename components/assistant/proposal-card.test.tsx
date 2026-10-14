import { describe, it, expect, vi } from "vitest"
import React from "react"
globalThis.React = React

import type { ActionKind } from "@/lib/assistant/action-envelope"
import { ProposalCard } from "./proposal-card"
import { ActionProposalCard } from "./action-proposal-card"
import { DepartmentProposalCard } from "./department-proposal-card"
import { DelegateTaskCard } from "./delegate-task-card"
import { PendingDispatchStrip } from "./pending-dispatch-strip"
import { VerifyProposalCard } from "./verify-proposal-card"
import { EditDepartmentProposalCard } from "./edit-department-proposal-card"
import { RemoveDepartmentProposalCard } from "./remove-department-proposal-card"

// Importing the cards pulls in server actions and next/navigation; the router only picks, never renders them.
vi.mock("@/lib/os/records/actions", () => ({ createLeadAction: vi.fn(), createTransactionAction: vi.fn(), createContentItemAction: vi.fn() }))
vi.mock("@/lib/os/doctor/preflight-actions", () => ({ runPreflightCheckAction: vi.fn() }))
vi.mock("@/lib/company-commands/run-company-command", () => ({ runCompanyCommand: vi.fn() }))
vi.mock("@/lib/os/departments/actions", () => ({
  createDepartmentAction: vi.fn(), retryCommitAction: vi.fn(),
  editDepartmentAction: vi.fn(), getDepartmentForEditAction: vi.fn(), planRemovalAction: vi.fn(), removeDepartmentAction: vi.fn(),
}))
vi.mock("@/lib/run-verify", () => ({ runCompanyVerify: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

function pick(actionType: ActionKind | undefined) {
  const el = ProposalCard({ proposal: { companyId: "acme", commandId: "x", actionType, label: "L", fields: {} }, companyName: "Acme" })
  return el.type
}

describe("ProposalCard", () => {
  it.each([
    ["verify", VerifyProposalCard],
    ["delegate_task", DelegateTaskCard],
    ["create_department", DepartmentProposalCard],
    ["edit_department", EditDepartmentProposalCard],
    ["remove_department", RemoveDepartmentProposalCard],
    [undefined, ActionProposalCard],
    ["command", ActionProposalCard],
    ["create_lead", ActionProposalCard],
  ] as const)("%s picks the matching card", (actionType, expected) => {
    expect(pick(actionType)).toBe(expected)
  })

  it("renders the pending-dispatch strip for a delegate_task proposal flagged auto, and the card otherwise", () => {
    const base = { companyId: "acme", commandId: "delegate-task", actionType: "delegate_task" as const, label: "x" }
    const strip = ProposalCard({ proposal: { ...base, fields: { task: "tidy", auto: "1", nonce: "n-1" } } })
    const card = ProposalCard({ proposal: { ...base, fields: { task: "tidy" } } })
    expect((strip as { type: unknown }).type).toBe(PendingDispatchStrip)
    expect((card as { type: unknown }).type).toBe(DelegateTaskCard)
  })
})
