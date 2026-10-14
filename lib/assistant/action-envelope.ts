/**
 * Structured Action Proposal envelope protocol.
 *
 * Allows the AI Assistant to propose background tasks backed by existing
 * COMPANY_COMMANDS or direct record mutations (leads, transactions, content)
 * without executing them immediately in the conversational turn.
 * The proposal is emitted as an <action_proposal> XML block in the assistant output,
 * which is parsed out so that the spoken voice output remains natural and clean,
 * while the UI renders an interactive ActionProposalCard.
 */

export type ActionKind =
  | "command" | "create_lead" | "create_transaction" | "create_content" | "create_department"
  | "edit_department" | "remove_department" | "verify" | "delegate_task"

export type ActionProposal = {
  companyId: string
  commandId: string
  actionType?: ActionKind
  label: string
  fields: Record<string, string>
  rationale?: string
}

export type ParsedActionEnvelope = {
  /** The clean conversational text to be spoken aloud and displayed in the transcript. */
  speech: string
  /** The structured action proposal, if validly present in the text. */
  proposal: ActionProposal | null
}

const ACTION_PROPOSAL_REGEX = /<action_proposal>([\s\S]*?)<\/action_proposal>/i

/**
 * Strips markdown code blocks (e.g. ```json ... ```) and whitespace.
 */
function cleanJsonString(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
}

/**
 * Infers the action kind from parsed proposal attributes.
 */
function inferActionKind(rawActionType?: unknown, rawCommandId?: unknown, rawKind?: unknown): ActionKind {
  const candidates = [rawActionType, rawCommandId, rawKind].map((c) =>
    typeof c === "string" ? c.toLowerCase().trim() : ""
  )

  if (candidates.some((c) => c === "create_lead" || c === "lead" || c === "add_lead")) {
    return "create_lead"
  }
  if (candidates.some((c) => c === "create_transaction" || c === "transaction" || c === "add_transaction")) {
    return "create_transaction"
  }
  if (candidates.some((c) => c === "create_content" || c === "content" || c === "add_content")) {
    return "create_content"
  }
  if (candidates.some((c) => c === "create_department" || c === "department" || c === "add_department")) {
    return "create_department"
  }
  if (candidates.some((c) => c === "edit_department" || c === "edit-department")) return "edit_department"
  if (candidates.some((c) => c === "remove_department" || c === "remove-department")) return "remove_department"
  if (candidates.some((c) => c === "verify")) return "verify"
  return "command"
}

/**
 * Parses raw text from the AI assistant, separating conversational speech
 * from any embedded <action_proposal> block.
 */
export function parseActionProposal(text: string): ParsedActionEnvelope {
  if (!text) {
    return { speech: "", proposal: null }
  }

  const match = text.match(ACTION_PROPOSAL_REGEX)
  if (!match) {
    return { speech: text.trim(), proposal: null }
  }

  const cleanSpeech = text.replace(ACTION_PROPOSAL_REGEX, "").trim()
  const rawProposalContent = match[1]

  try {
    const cleanedJson = cleanJsonString(rawProposalContent)
    const parsed = JSON.parse(cleanedJson)

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.companyId === "string" &&
      typeof parsed.commandId === "string"
    ) {
      const rawFields = typeof parsed.fields === "object" && parsed.fields !== null ? parsed.fields : {}
      const stringFields: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawFields)) {
        stringFields[k] = typeof v === "string" ? v : String(v)
      }

      const actionType = inferActionKind(parsed.actionType, parsed.commandId, parsed.kind)

      const proposal: ActionProposal = {
        companyId: parsed.companyId.trim(),
        commandId: parsed.commandId.trim(),
        ...(actionType !== "command" ? { actionType } : {}),
        label: typeof parsed.label === "string" && parsed.label.trim() ? parsed.label.trim() : parsed.commandId,
        fields: stringFields,
        rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim() : undefined,
      }

      return { speech: cleanSpeech, proposal }
    }
  } catch {
    // Malformed JSON is rejected gracefully without throwing; speech is still cleaned
  }

  return { speech: cleanSpeech, proposal: null }
}
