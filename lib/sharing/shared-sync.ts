import type { Agent } from "../adapters/types"
import { listLiveLinksImpl, sharingCompanies } from "./live"
import { syncSharedKnowledgeFile, type SharedFileResult } from "./shared-file"

/** Brings one company's `state/shared-knowledge.md` in line with its strings.
 *  Called right after a string is made, narrowed or cut — so a cut stops sharing
 *  at once rather than at the next tick — and when a terminal assistant opens. */
export async function syncSharedKnowledgeFor(companyId: string, getAgents?: () => Promise<Agent[]>): Promise<SharedFileResult> {
  try {
    const agents = await sharingCompanies(getAgents)
    const company = agents.find((a) => a.id === companyId)
    if (!company) return "skipped"
    return await syncSharedKnowledgeFile(company, await listLiveLinksImpl(async () => agents), agents)
  } catch {
    return "skipped"
  }
}

/** Every company, on the app's own timer: what a sharing company wrote since the
 *  last tick reaches the terminal assistants of the companies it shares with.
 *  Reads a few small files and writes only when something changed — no AI run,
 *  no subprocess unless a file is actually written. */
export async function syncAllSharedKnowledge(getAgents?: () => Promise<Agent[]>): Promise<void> {
  try {
    const agents = await sharingCompanies(getAgents)
    const links = await listLiveLinksImpl(async () => agents)
    for (const company of agents) await syncSharedKnowledgeFile(company, links, agents)
  } catch {
    /* a bad tick must not take the server down */
  }
}
