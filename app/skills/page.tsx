import { getEffectiveAgents, getEffectiveSkillAdapters } from "@/lib/get-effective-agents"
import { getAllSkills, mergeAndSortSkills } from "@/lib/get-all-skills"
import { SkillBrowser } from "@/components/skill-browser"

export const dynamic = "force-dynamic"

export default async function SkillsPage() {
  const [agents, skillAdapters] = await Promise.all([getEffectiveAgents(), getEffectiveSkillAdapters()])
  const results = await getAllSkills(agents, skillAdapters)
  const entries = mergeAndSortSkills(results)

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-8 pt-2 pb-12">
      <div className="a-rise">
        <p className="eyebrow">What your companies can do</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Skills &amp; Commands</h1>
      </div>
      <SkillBrowser results={results} entries={entries} />
    </main>
  )
}
