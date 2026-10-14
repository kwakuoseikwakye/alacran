import type { Agent, Activity, Adapter } from "./adapters/types"

export type AgentResult = {
  agent: Agent
  activities: Activity[]
  error: string | null
}

export async function getAllActivities(
  agents: Agent[],
  adapters: Record<string, Adapter>
): Promise<AgentResult[]> {
  return Promise.all(
    agents.map(async (agent) => {
      const adapter = adapters[agent.id]
      if (!adapter) {
        return { agent, activities: [], error: `No adapter registered for agent "${agent.id}"` }
      }
      try {
        const activities = await adapter(agent)
        return { agent, activities, error: null }
      } catch (err) {
        return {
          agent,
          activities: [],
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })
  )
}

export function mergeAndSortActivities(results: AgentResult[]): Activity[] {
  return results.flatMap((r) => r.activities).sort((a, b) => b.timestamp - a.timestamp)
}
