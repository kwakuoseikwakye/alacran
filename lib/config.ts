import { buildBuiltins } from "./builtin-agents"
import type { Agent, Adapter } from "./adapters/types"
import type { SkillAdapter } from "./skills/types"

// Product installs do not have the developer-only sample directories. This
// switch lets preview and end-to-end environments reproduce that true empty
// first run without moving or hiding anyone's real folders.
const builtins = buildBuiltins(
  process.env.ALACRAN_DISABLE_BUILTINS === "1" ? () => false : undefined
)

export const AGENTS: Agent[] = builtins.agents
export const ADAPTERS: Record<string, Adapter> = builtins.adapters
export const SKILL_ADAPTERS: Record<string, SkillAdapter> = builtins.skillAdapters
