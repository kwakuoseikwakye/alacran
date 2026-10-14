"use server"

import { resolveAiExecutorForAgent } from "./ai-executor-registry"
import { cannotNote, type Need } from "./executor-capabilities"

/** The note for this company's current AI, or null when it can do the job. */
export async function getExecutorGapNote(agentId: string, need: Need): Promise<string | null> {
  try {
    return cannotNote(await resolveAiExecutorForAgent(agentId), need)
  } catch {
    // A note is advice, never a gate: failing to read the registry shows nothing.
    return null
  }
}
