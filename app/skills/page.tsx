import { getEffectiveAgents, getEffectiveSkillAdapters } from "@/lib/get-effective-agents"
import { isAppManagedSkillPath } from "@/lib/vendored-skills"
import { getAllSkills, mergeAndSortSkills } from "@/lib/get-all-skills"
import { SkillBrowser } from "@/components/skill-browser"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"

export const dynamic = "force-dynamic"

export default async function SkillsPage() {
  const [agents, skillAdapters] = await Promise.all([getEffectiveAgents(), getEffectiveSkillAdapters()])
  const results = await getAllSkills(agents, skillAdapters)
  const entries = mergeAndSortSkills(results)
  // Runs that produced changes nobody has approved yet — a scheduled overnight
  // run has no other way to announce itself.
  const pending = await listPendingReviews(agents)
  // Skills the app installed and keeps updated: read-only, because the next
  // update replaces them wholesale. The write path refuses them too
  // (resolveWritableSkillPath) — this only removes the affordance, so nobody
  // types into a box whose save is going to be rejected.
  const rootByAgentId = new Map(results.map((r) => [r.agent.id, r.agent.rootPath]))
  const appManagedPaths = (
    await Promise.all(
      entries.map(async (entry) => {
        const rootPath = rootByAgentId.get(entry.agentId)
        if (!rootPath) return null
        return (await isAppManagedSkillPath(rootPath, entry.path)) ? entry.path : null
      })
    )
  ).filter((p): p is string => p !== null)

  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">What your companies can do</p>
          <h1>Skills &amp; Commands</h1>
          <p>Browse, read, and run the skills installed across every company.</p>
        </div>
      </header>
      <div className="dash-content">
        <SkillBrowser
          results={results}
          entries={entries}
          appManagedPaths={appManagedPaths}
          pendingKeys={pending.map((p) => `${p.agentId}:${p.commandId}`)}
        />
      </div>
    </>
  )
}
