import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { BrainDump } from "@/components/os/brain/brain-dump"
import { BrainViewSwitch } from "@/components/os/brain/brain-view-switch"
import { MemoryHealthCard } from "@/components/os/memory-health-card"
import { loadMemoryHealth } from "@/lib/os/memory-health/load"
import { MemoryMap } from "@/components/os/brain/memory-map"
import { readMemoryGraph } from "@/lib/os/brain/memory-graph-read"
import { MemoryList } from "@/components/os/brain/memory-list"
import { listMemoryItems, thisWeek, weekSummary } from "@/lib/os/memory-items"

export const dynamic = "force-dynamic"

/**
 * What Alacrán knows. Opens on the memory map of the company's committed
 * content; the plain list is one link away (`?view=list`). Any other `view`
 * value, including the old `map`, shows the map.
 */
export default async function BrainPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { companyId } = await params
  const { view } = await searchParams
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) notFound()

  if (view !== "list") {
    const graph = await readMemoryGraph(agent.rootPath, agent.name || companyId)
    return (
      <div className="dash-content brain-page flex h-[calc(100dvh-52px)] min-h-[560px] flex-col pb-6">
        <PageHeader title="What Alacrán knows" rightWide right={<BrainDump compact companyId={companyId} />} />
        <BrainViewSwitch companyId={companyId} active="map" />
        <div className="min-h-0 flex-1">
          <MemoryMap companyId={companyId} graph={graph} />
        </div>
      </div>
    )
  }

  const [items, health] = await Promise.all([listMemoryItems(agent.rootPath), loadMemoryHealth(agent.rootPath)])
  const week = thisWeek(items, new Date())
  const subtext = items.length === 0 ? "Nothing saved yet." : week.length ? `This week: ${weekSummary(week)}` : "Nothing new this week."
  return (
    <div className="dash-content pb-10">
      <PageHeader title="What Alacrán knows" rightWide right={<BrainDump compact companyId={companyId} />} subtext={subtext} />
      <BrainViewSwitch companyId={companyId} active="list" />
      <MemoryHealthCard companyId={companyId} health={health} />
      <MemoryList items={items} />
    </div>
  )
}
