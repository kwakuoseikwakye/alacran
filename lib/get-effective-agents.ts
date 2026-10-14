import { cache } from "react"
import type { Agent, Adapter } from "./adapters/types"
import type { SkillAdapter } from "./skills/types"
import { AGENTS, ADAPTERS, SKILL_ADAPTERS } from "./config"
import { getRegisteredCompanies } from "./companies-registry"
import { genericCommandSetSkillAdapter } from "./skills/generic-command-set"
import { genericGitLogActivityAdapter } from "./adapters/generic-git-log"

async function getEffectiveAgentsUncached(): Promise<Agent[]> {
  const staticIds = new Set(AGENTS.map((a) => a.id))
  const companies = await getRegisteredCompanies()
  const companyAgents: Agent[] = companies
    .filter((c) => !staticIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      rootPath: c.rootPath,
      // Absent kind means command-set — see RegisteredCompany.
      kind: c.kind === "external" ? ("external" as const) : ("command-set" as const),
    }))
  return [...AGENTS, ...companyAgents]
}

// A company layout and its page both need this list. React's request cache
// makes those reads one operation without serving stale registry data to a
// later navigation or requiring manual invalidation after Add/Remove Company.
export const getEffectiveAgents = cache(getEffectiveAgentsUncached)

export async function getEffectiveAdapters(): Promise<Record<string, Adapter>> {
  const companies = await getRegisteredCompanies()
  const merged: Record<string, Adapter> = { ...ADAPTERS }
  for (const c of companies) {
    if (!(c.id in merged)) {
      merged[c.id] = genericGitLogActivityAdapter
    }
  }
  return merged
}

export async function getEffectiveSkillAdapters(): Promise<Record<string, SkillAdapter>> {
  const companies = await getRegisteredCompanies()
  const merged: Record<string, SkillAdapter> = { ...SKILL_ADAPTERS }
  for (const c of companies) {
    if (!(c.id in merged)) {
      merged[c.id] = genericCommandSetSkillAdapter
    }
  }
  return merged
}
