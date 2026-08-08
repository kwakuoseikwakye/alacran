import { getEffectiveAgents, getEffectiveSkillAdapters } from "@/lib/get-effective-agents"
import { getAllSkills, mergeAndSortSkills } from "@/lib/get-all-skills"
import { SkillBrowser } from "@/components/skill-browser"

export const dynamic = "force-dynamic"

export default async function SkillsPage() {
  const [agents, skillAdapters] = await Promise.all([getEffectiveAgents(), getEffectiveSkillAdapters()])
  const results = await getAllSkills(agents, skillAdapters)
  const entries = mergeAndSortSkills(results)

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
        <SkillBrowser results={results} entries={entries} />
      </div>
    </>
  )
}
