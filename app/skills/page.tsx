import { getEffectiveAgents, getEffectiveSkillAdapters } from "@/lib/get-effective-agents"
import { getAllSkills, mergeAndSortSkills } from "@/lib/get-all-skills"
import { SkillBrowser } from "@/components/skill-browser"

export const dynamic = "force-dynamic"

export default async function SkillsPage() {
  const [agents, skillAdapters] = await Promise.all([getEffectiveAgents(), getEffectiveSkillAdapters()])
  const results = await getAllSkills(agents, skillAdapters)
  const entries = mergeAndSortSkills(results)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Skills &amp; Commands</h1>
      <SkillBrowser results={results} entries={entries} />
    </main>
  )
}
