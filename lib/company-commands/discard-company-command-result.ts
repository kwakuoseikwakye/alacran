"use server"

import { discardCompanyCommandResultImpl } from "./discard-company-command-result-impl"
import { afterDiscard } from "../os/preferences/outcome-hooks"

export async function discardCompanyCommandResult(
  commandId: string,
  agentId: string,
  expectedOwned?: { path: string; newText: string }[]
): Promise<{ discarded: boolean; message: string }> {
  return discardCompanyCommandResultImpl(commandId, agentId, undefined, undefined, expectedOwned, afterDiscard)
}
