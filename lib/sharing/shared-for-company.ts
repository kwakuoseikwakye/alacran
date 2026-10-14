import { getEffectiveAgents } from "../get-effective-agents"
import { listLiveLinksImpl } from "./live"
import { buildSharedKnowledgeBlock } from "./shared-context"
import { SHARED_FILE } from "./shared-file"
import { syncSharedKnowledgeFor } from "./shared-sync"

/**
 * What other companies share with this one, as the text a prompt appends — the
 * one place Ask and the terminal assistant both call, so the two cannot drift
 * into saying different things about the same strings.
 *
 * Never throws: knowledge from another company is a bonus on top of an answer
 * that must still arrive, so any failure here is "nothing shared", not a
 * refusal to answer. Empty when no string points at this company.
 */
export async function sharedKnowledgeFor(agentId: string): Promise<string> {
  try {
    const agents = await getEffectiveAgents()
    const links = await listLiveLinksImpl(async () => agents)
    if (!links.some((l) => l.to === agentId)) return ""
    const me = agents.find((a) => a.id === agentId)
    return me ? await buildSharedKnowledgeBlock(agentId, me.name, links, agents) : ""
  } catch {
    return ""
  }
}

/**
 * The same block for a terminal assistant's opening message, plus where to look
 * again. The opening message is a snapshot and the session can run for hours; the
 * other company can change in that time, and a string can be added or cut. So the
 * file is brought up to date first and the assistant is told to re-read it before
 * answering anything that depends on another company.
 *
 * The pointer is only added when the file really is there: a person's own file
 * under that name is never overwritten (shared-file.ts), and telling the
 * assistant to read a file that is not ours would be worse than saying nothing.
 */
export async function sharedKnowledgeForTerminal(agentId: string): Promise<string> {
  const block = await sharedKnowledgeFor(agentId)
  if (!block) return ""
  const synced = await syncSharedKnowledgeFor(agentId)
  if (synced !== "written" && synced !== "unchanged") return block
  return `${block}\n\nThis was current when you started. It is also kept in ${SHARED_FILE}, which Alacrán rewrites whenever what other companies share changes and deletes when nothing is shared. Read that file again before you answer anything that depends on another company, rather than relying on the text above.`
}

