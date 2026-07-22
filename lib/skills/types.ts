import type { Agent } from "../adapters/types"

export type SkillKind = "skill" | "command"

export type SkillEntry = {
  id: string
  agentId: string
  kind: SkillKind
  name: string
  description: string
  path: string
}

export type SkillAdapter = (agent: Agent) => Promise<SkillEntry[]>
