import path from "node:path"
import type { Agent } from "../adapters/types"
import type { SkillAdapter } from "./types"
import { scanSkillsDir } from "./scan-helpers"

export const plhTakeshiAgentSkillsAdapter: SkillAdapter = async (agent: Agent) => {
  return scanSkillsDir(agent.id, path.join(agent.rootPath, "skills"))
}
