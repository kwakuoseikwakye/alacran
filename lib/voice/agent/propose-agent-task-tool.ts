import type { ActionProposal } from "../../assistant/action-envelope"
import { isGatedTask } from "../../terminal/gated-task"
import { sanitizeTaskText } from "../../terminal/task-text"
import { DISPATCH_SECONDS } from "./dispatch-timer"
import { resolveCompany, type CompanyCtx } from "./resolve-company"

/** Shown in the Console tab while the tool runs. */
export const TASK_TOOL_LABEL = "Pass a task to your agent"

export type TaskToolCtx = CompanyCtx & {
  /** Company ids switched on for auto-dispatch. */
  autoDispatch?: readonly string[]
  /** True while another dispatch is counting down; a second one falls back to the card. */
  dispatchBusy?: boolean
  /** One id per strip, so a strip that mounts twice still sends once. Injectable for tests. */
  nonce?: () => string
}

/**
 * What the ElevenLabs agent gets back when it calls `propose_agent_task`.
 *
 * This only BUILDS a proposal. Sending is the card button's job, or the strip's timer after the owner
 * has had the exact words read back and a window to cancel, so nothing in this file may send, run or
 * fetch (a test reads this file to pin that). The task is data for the card: it is never echoed in
 * the returned text.
 */
export function runProposeAgentTaskTool(
  args: Record<string, unknown>,
  ctx: TaskToolCtx
): { text: string; proposal: ActionProposal | null } {
  const task = sanitizeTaskText(args.task)
  if (!task) {
    return { text: "I didn't get what to ask the agent to do. Ask the user to say it again. Do not guess.", proposal: null }
  }
  const resolved = resolveCompany(args.company, ctx)
  if (!resolved.ok) return { text: resolved.text, proposal: null }
  const { company } = resolved
  const auto = !ctx.dispatchBusy && (ctx.autoDispatch?.includes(company.id) ?? false) && !isGatedTask(task)
  if (auto) {
    return {
      text: `The task is sending to the agent in ${DISPATCH_SECONDS} seconds. Read it back to the user in one short sentence and say they can say cancel to stop it. It is not done yet. Say so. If the user cancels, tell them to check the screen to confirm nothing was sent; do not promise it was stopped.`,
      proposal: {
        companyId: company.id,
        commandId: "delegate-task",
        actionType: "delegate_task",
        label: `Sending to ${company.name}'s agent`,
        fields: { task, auto: "1", nonce: (ctx.nonce ?? (() => globalThis.crypto.randomUUID()))() },
        rationale: "Typed into the owner's agent after a short cancel window.",
      },
    }
  }
  return {
    text: "A proposal is on screen for the owner to approve. It is not done yet. Say so.",
    proposal: {
      companyId: company.id,
      commandId: "delegate-task",
      actionType: "delegate_task",
      label: `Send to ${company.name}'s agent`,
      fields: { task },
      rationale: "Typed into the owner's agent exactly as shown.",
    },
  }
}
