import type { ActionProposal } from "../../assistant/action-envelope"
import { resolveCompany, type CompanyCtx } from "./resolve-company"

export const MAX_ANSWER = 2000
/** Shown in the Console tab while the tool runs. */
export const SETUP_TOOL_LABEL = "Set up the company profile"

const ANSWERS = [
  ["domain", "what the business does"],
  ["stakeholders", "who the customers, team and partners are"],
  ["valueFlow", "how value flows through the business"],
  ["bottleneck", "the biggest bottleneck right now"],
] as const

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/**
 * What the ElevenLabs agent gets back when it calls `propose_define_company`.
 *
 * This only ever BUILDS a proposal. Running the command is the approval card's
 * job, after the owner presses the button, so nothing in this file may import
 * or call the code that starts a run (a test reads this file to pin that).
 * The answers are data: they go into `fields` and are never echoed in the
 * returned text, so markup inside an answer cannot reach the agent.
 */
export function runProposeDefineCompanyTool(
  args: Record<string, unknown>,
  ctx: CompanyCtx
): { text: string; proposal: ActionProposal | null } {
  const answers = ANSWERS.map(([key, label]) => ({ key, label, value: text(args[key]).slice(0, MAX_ANSWER) }))
  const missing = answers.filter((a) => !a.value)
  if (missing.length) {
    return {
      text: `I still need: ${missing.map((a) => a.label).join("; ")}. Ask the user for ${missing.length === 1 ? "it" : "them"}. Do not guess.`,
      proposal: null,
    }
  }

  // A name that matches nothing must not silently become the dock's company:
  // the card would carry one company's answers under another's name.
  const resolved = resolveCompany(args.company, ctx)
  if (!resolved.ok) return { text: resolved.text, proposal: null }
  const { company } = resolved

  const fields = Object.fromEntries(answers.map((a) => [a.key, a.value]))
  return {
    text: "A proposal is on screen for the owner to approve. It is not done yet. Say so.",
    proposal: {
      companyId: company.id,
      commandId: "define-company",
      label: `Define ${company.name}`,
      fields,
      rationale: "Drafted from the owner's spoken answers.",
    },
  }
}
