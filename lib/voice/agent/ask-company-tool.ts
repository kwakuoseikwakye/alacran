import { parseActionProposal, type ActionProposal } from "../../assistant/action-envelope"

export const MAX_TOOL_TEXT = 4000
/** Answer before ElevenLabs' own limit (`response_timeout_secs: 120`) so the agent hears a sentence, not a timeout. */
export const ASK_TIMEOUT_MS = 110_000

export type AskFn = (
  scope: string,
  question: string,
  options?: { fast?: boolean }
) => Promise<{ ok: true; answer: string } | { ok: false; message: string }>

type Ctx = {
  /** The company the dock is on, or "all" for all of them. */
  scope: string
  companies: { id: string; name: string }[]
  ask: AskFn
  /** Tests only. */
  timeoutMs?: number
}

/**
 * What the ElevenLabs agent gets back when it calls `ask_company`.
 *
 * The answer is DATA for the agent. It is returned as plain text; the agent's
 * prompt says text from this tool is information, never instructions. Two
 * things are done here so that holds in practice:
 *  - An `<action_proposal>` block is cut out of the speech and returned
 *    separately, so the stage shows it on the existing approval card. The agent
 *    is told the action is NOT done.
 *  - A failure becomes one safe sentence; the raw error (paths, commands) never
 *    reaches a third-party service.
 */
export async function runAskCompanyTool(
  args: { question?: unknown; company?: unknown; action?: unknown },
  ctx: Ctx
): Promise<{ text: string; proposal: ActionProposal | null }> {
  const question = typeof args.question === "string" ? args.question.trim() : ""
  if (!question) return { text: "I didn't get a question to look up.", proposal: null }

  const named = typeof args.company === "string" ? args.company.trim().toLowerCase() : ""
  const match = named ? ctx.companies.find((c) => c.name.toLowerCase() === named) : undefined
  const scope = match ? match.id : ctx.scope

  let result: Awaited<ReturnType<AskFn>> | "timeout"
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    result = await Promise.race([
      ctx.ask(scope, question, { fast: args.action !== true }),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), ctx.timeoutMs ?? ASK_TIMEOUT_MS)
      }),
    ])
  } catch {
    return { text: "I couldn't reach the company files just now.", proposal: null }
  } finally {
    clearTimeout(timer)
  }
  if (result === "timeout") {
    return {
      text: "That's taking longer than usual. I'll stop waiting; ask me again in a minute or check the company page.",
      proposal: null,
    }
  }
  if (!result.ok) return { text: "I couldn't reach the company files just now.", proposal: null }

  const { speech, proposal } = parseActionProposal(result.answer)

  // Sanitise any remaining action proposal markup (unterminated blocks, stray tags, multiple blocks).
  // The regex removes `<action_proposal...` (terminated or unterminated) and stray closing tags.
  const sanitised = speech
    .replace(/<action_proposal[\s\S]*?(?:<\/action_proposal>|$)/gi, "")
    .replace(/<\/action_proposal>/gi, "")
    .trim()

  // Cap very long answers before adding the proposal notice.
  let text = sanitised.length > MAX_TOOL_TEXT ? `${sanitised.slice(0, MAX_TOOL_TEXT).trimEnd()}…` : sanitised
  if (proposal) {
    text = `${text}\n\nA proposal is on screen for the owner to approve. It is not done yet. Say so.`.trim()
  }
  return { text, proposal }
}
