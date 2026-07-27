"use server"

import { commitCompanyCommandResultImpl } from "./commit-company-command-result-impl"

export async function commitCompanyCommandResult(
  commandId: string,
  relativeOutputPath: string,
  agentId: string
): Promise<{ committed: boolean; message: string }> {
  return commitCompanyCommandResultImpl(commandId, relativeOutputPath, agentId)
}
