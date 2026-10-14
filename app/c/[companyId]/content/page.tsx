import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { readContentItems } from "@/lib/os/records/read"
import { resolveDepartmentConnectors } from "@/lib/os/departments/connectors"
import { buildContentViewModel } from "@/lib/os/departments/adapters/content-adapter"
import { ContentCockpit } from "@/components/os/content/content-cockpit"

export const dynamic = "force-dynamic"

export default async function ContentPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params

  const allAgents = await getEffectiveAgents()
  const agent = allAgents.find((a) => a.id === companyId)
  if (!agent) notFound()

  const [itemsResult, connectors] = await Promise.all([
    readContentItems(agent.rootPath),
    resolveDepartmentConnectors(
      [
        { id: "ghost", label: "Ghost / Blog" },
        { id: "substack", label: "Substack" },
        { id: "github", label: "GitHub" },
      ],
      { companyPath: agent.rootPath }
    ),
  ])

  const model = buildContentViewModel({
    items: itemsResult.records,
    connectors,
    companyId,
  })

  return <ContentCockpit model={model} companyId={companyId} />
}
