import type { Agent } from "./adapters/types"
import type { SkillEntry, SkillAdapter } from "./skills/types"

export type SkillAgentResult = {
  agent: Agent
  entries: SkillEntry[]
  error: string | null
}

export async function getAllSkills(
  agents: Agent[],
  adapters: Record<string, SkillAdapter>
): Promise<SkillAgentResult[]> {
  return Promise.all(
    agents.map(async (agent) => {
      const adapter = adapters[agent.id]
      if (!adapter) {
        return { agent, entries: [], error: `No skill adapter registered for agent "${agent.id}"` }
      }
      try {
        const entries = await adapter(agent)
        return { agent, entries, error: null }
      } catch (err) {
        return { agent, entries: [], error: err instanceof Error ? err.message : String(err) }
      }
    })
  )
}

export function mergeAndSortSkills(results: SkillAgentResult[]): SkillEntry[] {
  return results.flatMap((r) => r.entries).sort((a, b) => a.name.localeCompare(b.name))
}
