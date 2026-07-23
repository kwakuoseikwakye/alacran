"use server"

import { getCompanyCommandResultImpl } from "./company-command-result-impl"
import type { CompanyCommandResult } from "./company-command-result-impl"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { AGENTS } from "../config"

const AI_COMPANY_STARTER_MAIN_ID = "ai-company-starter-main"

export async function getCompanyCommandResult(commandId: string): Promise<CompanyCommandResult> {
  const agent = AGENTS.find((a) => a.id === AI_COMPANY_STARTER_MAIN_ID)
  if (!agent) {
    return { changed: false, message: `Agent "${AI_COMPANY_STARTER_MAIN_ID}" is not configured` }
  }
  return getCompanyCommandResultImpl(commandId, COMPANY_COMMANDS_DATA_DIR, agent.rootPath)
}
