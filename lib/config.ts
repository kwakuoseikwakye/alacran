import { buildBuiltins } from "./builtin-agents"
import type { Agent, Adapter } from "./adapters/types"
import type { SkillAdapter } from "./skills/types"

const builtins = buildBuiltins()

export const AGENTS: Agent[] = builtins.agents
export const ADAPTERS: Record<string, Adapter> = builtins.adapters
export const SKILL_ADAPTERS: Record<string, SkillAdapter> = builtins.skillAdapters
