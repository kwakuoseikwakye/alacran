import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { BrainDump } from "@/components/os/brain/brain-dump"
import { BrainGraphView } from "@/components/os/brain/brain-graph-view"
import { BrainViewSwitch } from "@/components/os/brain/brain-view-switch"
import { MemoryHealthCard } from "@/components/os/memory-health-card"
import { loadMemoryHealth } from "@/lib/os/memory-health/load"
import { MemoryList } from "@/components/os/brain/memory-list"
import { buildBrainViewModel } from "@/lib/os/brain/adapter"
import { readDefinitionsTree } from "@/lib/os/brain/definitions-files"
import { gatherCrossCompanyDecisions } from "@/lib/assistant/gather-all-companies"
import { readOntology } from "@/lib/os/ontology/read"
import { getCompanyDepartments } from "@/lib/os/departments/registry"
import { listMemoryItems, thisWeek, weekSummary } from "@/lib/os/memory-items"
import type { Agent } from "@/lib/adapters/types"
import type { Person, SopTask } from "@/lib/os/brain/types"

export const dynamic = "force-dynamic"

/** The map's view model. Only built when the map is asked for: it reads the ontology and every decision. */
async function buildMapModel(agent: Agent, companyId: string) {
  const [definitionsNodes, crossDecisions, ontologyResult] = await Promise.all([
    readDefinitionsTree(agent.rootPath).catch(() => []),
    gatherCrossCompanyDecisions([agent]).catch(() => []),
    readOntology(agent.rootPath),
  ])

  const companyDecisions = crossDecisions.filter((d) => d.companyId === companyId)
  const ontology = ontologyResult.ok ? ontologyResult.ontology : null
  const departments = getCompanyDepartments(agent.rootPath, ontology)

  // Derive real human stakeholders from ontology roles
  const people: Person[] =
    ontology?.org?.roles?.map((r) => {
      const dept = departments.find((d) => d.roles.some((dr) => dr.id === r.id)) || departments[0]
      return {
        id: r.id,
        departmentId: dept.id,
        name: r.name,
        role: r.owns || r.name,
        tools: [],
      }
    }) || []

  // Derive real workflow tasks from ontology value flow steps
  const tasks: SopTask[] =
    ontology?.product?.value_flow?.map((vf, idx) => {
      const ownerRole = people.find((p) => p.id === vf.owner || p.name === vf.owner)
      return {
        id: `task-flow-${idx}`,
        departmentId: "dept-funnel",
        title: vf.step,
        summary: vf.step,
        steps: [vf.step],
        assigneeKind: ownerRole ? "person" : "agent",
        assigneeId: ownerRole ? ownerRole.id : "operator",
      }
    }) || []

  return buildBrainViewModel({
    companyRoot: agent.rootPath,
    operatorName: agent.name || "Operator",
    definitionsNodes,
    decisions: companyDecisions.length > 0 ? companyDecisions : crossDecisions,
    departments,
    people,
    tasks,
  })
}

/**
 * What Alacrán knows. Opens on a plain list of the company's committed memory;
 * the knowledge-graph map is one link away (`?view=map`). Any other `view`
 * value shows the list.
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

  if (view === "map") {
    const model = await buildMapModel(agent, companyId)
    return (
      <div className="dash-content brain-page flex h-[calc(100dvh-52px)] min-h-[560px] flex-col pb-6">
        <PageHeader title="What Alacrán knows" rightWide right={<BrainDump compact companyId={companyId} />} />
        <BrainViewSwitch companyId={companyId} active="map" />
        <div className="min-h-0 flex-1">
          <BrainGraphView fill {...model} />
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
