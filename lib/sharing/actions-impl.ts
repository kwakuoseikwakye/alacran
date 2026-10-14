import type { Agent } from "../adapters/types"
import { createLinkImpl, deleteLinkImpl, updateLinkScopeImpl } from "./links"
import { listLiveLinksImpl, sharingCompanies } from "./live"
import { syncSharedKnowledgeFor } from "./shared-sync"
import { cleanShareScope, DEFAULT_SHARE_SCOPE, type ShareLink } from "./model"
import { previewShare, type SharedPreview } from "./shared-context"

export { listLiveLinksImpl }

type Fail = { ok: false; message: string }

/** What dropping a string from `from` onto `to` would share, for the question
 *  asked before it is made. Reads, writes nothing. */
export async function previewConnectionImpl(
  fromId: string,
  toId: string,
  rawScope?: unknown,
  getAgents?: () => Promise<Agent[]>
): Promise<{ ok: true; fromName: string; toName: string; preview: SharedPreview } | Fail> {
  const agents = await sharingCompanies(getAgents)
  const from = agents.find((a) => a.id === fromId)
  const to = agents.find((a) => a.id === toId)
  if (!from || !to) return { ok: false, message: "That company isn't here any more." }
  if (from.id === to.id) return { ok: false, message: "A company can't share with itself." }
  const scope = rawScope === undefined ? DEFAULT_SHARE_SCOPE : cleanShareScope(rawScope)
  if (!scope) return { ok: false, message: "Choose at least one thing to share." }
  return { ok: true, fromName: from.name, toName: to.name, preview: await previewShare(from, scope) }
}

/** After any change to a string, the receiving company's shared file is brought
 *  in line at once: a terminal assistant that is already running reads it again,
 *  and a cut must stop sharing now, not at the next tick. Best effort — the
 *  string itself is already saved, and a failed sync is retried by the timer. */
export async function connectCompaniesImpl(
  fromId: string,
  toId: string,
  rawScope?: unknown,
  getAgents?: () => Promise<Agent[]>
): Promise<{ ok: true; link: ShareLink } | Fail> {
  const made = await createLinkImpl(
    { from: fromId, to: toId, scope: rawScope },
    { knownIds: async () => (await sharingCompanies(getAgents)).map((a) => a.id) }
  )
  if (made.ok) await syncSharedKnowledgeFor(made.link.to, getAgents)
  return made
}

export async function updateShareScopeImpl(linkId: string, rawScope: unknown, getAgents?: () => Promise<Agent[]>) {
  const updated = await updateLinkScopeImpl(linkId, rawScope)
  if (updated.ok) await syncSharedKnowledgeFor(updated.link.to, getAgents)
  return updated
}

export async function cutShareLinkImpl(linkId: string, getAgents?: () => Promise<Agent[]>) {
  const cut = await deleteLinkImpl(linkId)
  if (cut.ok) await syncSharedKnowledgeFor(cut.link.to, getAgents)
  return cut
}
