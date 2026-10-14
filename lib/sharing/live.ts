import { getEffectiveAgents } from "../get-effective-agents"
import { isAssistantCompany } from "../assistant/gather-all-companies"
import type { Agent } from "../adapters/types"
import { listLinksImpl } from "./links"
import type { ShareLink } from "./model"

/** Companies a string can join: the ones the assistant already speaks for.
 *  `external` folders follow none of this app's conventions and have no memory
 *  to share or receive (the v66 rule: a new company feature is off for them). */
export async function sharingCompanies(getAgents: () => Promise<Agent[]> = getEffectiveAgents): Promise<Agent[]> {
  return (await getAgents()).filter(isAssistantCompany)
}

/** Every string whose two ends still exist: a company removed from the registry
 *  leaves its strings in the file, and they must neither draw nor share. */
export async function listLiveLinksImpl(getAgents?: () => Promise<Agent[]>): Promise<ShareLink[]> {
  const ids = new Set((await sharingCompanies(getAgents)).map((a) => a.id))
  return (await listLinksImpl()).filter((l) => ids.has(l.from) && ids.has(l.to))
}
