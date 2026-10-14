"use server"

import { commitCompanyCommandResultImpl } from "./commit-company-command-result-impl"
import { afterApproval } from "../os/preferences/outcome-hooks"

export async function commitCompanyCommandResult(
  commandId: string,
  relativeOutputPath: string,
  agentId: string,
  expectedText?: string,
  expectedOwned?: { path: string; newText: string }[]
): Promise<{ committed: boolean; message: string }> {
  // A person pressing Approve: this is the moment the first-run guide is done.
  return commitCompanyCommandResultImpl(commandId, relativeOutputPath, agentId, undefined, undefined, expectedText, afterApproval, expectedOwned)
}
