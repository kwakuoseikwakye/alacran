"use server"

import path from "node:path"
import { checkRunLockStatus } from "./run-lock"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { getEffectiveAgents } from "../get-effective-agents"

export async function getCompanyCommandStatus(agentId: string): Promise<{ running: boolean }> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { running: false }
  }
  return checkRunLockStatus(path.join(COMPANY_COMMANDS_DATA_DIR, agentId))
}
