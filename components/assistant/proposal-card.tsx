"use client"

import type { ActionProposal } from "@/lib/assistant/action-envelope"
import { ActionProposalCard } from "./action-proposal-card"
import { DepartmentProposalCard } from "./department-proposal-card"
import { EditDepartmentProposalCard } from "./edit-department-proposal-card"
import { RemoveDepartmentProposalCard } from "./remove-department-proposal-card"
import { DelegateTaskCard } from "./delegate-task-card"
import { PendingDispatchStrip } from "./pending-dispatch-strip"
import { VerifyProposalCard } from "./verify-proposal-card"

/**
 * One place that picks the card for a proposal, so the dock, the voice stage and the old stage never disagree.
 * onActed fires the moment the owner presses the card's action (not when it finishes), so a host can refuse to offer it twice.
 */
export function ProposalCard({ proposal, companyName, onActed }: { proposal: ActionProposal; companyName?: string; onActed?: () => void }) {
  switch (proposal.actionType) {
    case "create_department":
      return <DepartmentProposalCard proposal={proposal} companyName={companyName} onActed={onActed} />
    case "edit_department":
      return <EditDepartmentProposalCard proposal={proposal} onActed={onActed} />
    case "remove_department":
      return <RemoveDepartmentProposalCard proposal={proposal} onActed={onActed} />
    case "verify":
      return <VerifyProposalCard proposal={proposal} onActed={onActed} />
    case "delegate_task":
      return proposal.fields.auto === "1" ? (
        <PendingDispatchStrip proposal={proposal} companyName={companyName} onActed={onActed} />
      ) : (
        <DelegateTaskCard proposal={proposal} companyName={companyName} onActed={onActed} />
      )
    default:
      return <ActionProposalCard proposal={proposal} onActed={onActed} />
  }
}
