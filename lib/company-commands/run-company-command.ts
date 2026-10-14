"use server"

import { runCompanyCommandImpl } from "./run-company-command-impl"
import { getCompanyCommand } from "./registry"

export async function runCompanyCommand(
  commandId: string,
  fieldValues: Record<string, string>,
  agentId: string
): Promise<{ started: boolean; message: string }> {
  // Also reached from an assistant proposal card with a model-chosen id, so a command that only a
  // review may start (apply-session-facts: its lines are checked against a committed note first) is
  // refused here. Its own button goes through applySessionFactsImpl, which calls the impl directly.
  if (getCompanyCommand(commandId)?.manualOnly) return { started: false, message: "That can only be started from a review." }
  return runCompanyCommandImpl(commandId, fieldValues, agentId)
}
