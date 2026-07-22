import path from "node:path"
import type { Agent } from "../adapters/types"
import type { SkillAdapter } from "./types"
import { scanSkillsDir, scanCommandsDir } from "./scan-helpers"

export const aiCompanyStarterMainSkillsAdapter: SkillAdapter = async (agent: Agent) => {
  const [skills, commands] = await Promise.all([
    scanSkillsDir(agent.id, path.join(agent.rootPath, ".claude", "skills")),
    scanCommandsDir(agent.id, path.join(agent.rootPath, ".claude", "commands")),
  ])
  return [...skills, ...commands]
}
