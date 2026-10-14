import { parseBlock } from "./apply"
import { buildProposal } from "./proposal"
import type { GuideProposal } from "./proposal"
import { renderGuide } from "./render"
import type { GuideInputs } from "./render"

// Made-up company content: one change of every kind, in each of Teams, Commands and Departments.
const BEFORE: GuideInputs = {
  departments: [{ slug: "legal", name: "Legal", purpose: "Contracts and compliance." }],
  teams: [{ id: "sales", label: "Sales", summary: "Leads and accounts.", commands: ["follow-up-lead"] }],
  commands: [{ name: "old-brief", description: "Draft the weekly brief." }],
}
const AFTER: GuideInputs = {
  departments: [{ slug: "legal", name: "Legal", purpose: "Contracts, compliance and vendor reviews." }],
  teams: [BEFORE.teams[0], { id: "marketing", label: "Marketing", summary: "Campaigns, content and positioning.", commands: [] }],
  commands: [{ name: "pricing-strategy", description: "Work out a pricing model and test it against your costs." }],
}

/**
 * The Approvals "Guide update" card with sample content, for the preview page. It goes through the real render and
 * diff, so it shows exactly what a real company's card would, and cannot drift from it.
 */
export function sampleProposal(): GuideProposal {
  const old = parseBlock(renderGuide(BEFORE).block)
  if (old.kind !== "ok") throw new Error("the sample guide block did not parse")
  return buildProposal(old.body, renderGuide(AFTER), old.bodyHash ?? "")
}
