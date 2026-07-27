"use server"

import path from "node:path"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"
import type { CompanyCommandResult } from "./company-command-result-impl"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { getEffectiveAgents } from "../get-effective-agents"

export async function getCompanyCommandResult(commandId: string, agentId: string): Promise<CompanyCommandResult> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { changed: false, message: `Unknown company "${agentId}"` }
  }
  return getCompanyCommandResultImpl(commandId, path.join(COMPANY_COMMANDS_DATA_DIR, agentId), agent.rootPath)
}
