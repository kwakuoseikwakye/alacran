import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { readContentItems } from "@/lib/os/records/read"
import { resolveDepartmentConnectors } from "@/lib/os/departments/connectors"
import { buildContentViewModel } from "@/lib/os/departments/adapters/content-adapter"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { Badge } from "@/components/os/terminal"
import { LeadMagnetsTable } from "@/components/os/content/lead-magnets-table"

export const dynamic = "force-dynamic"

export default async function LeadMagnetsPage({
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

  const live = model.leadMagnets.filter((m) => m.status === "live").length

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Lead Magnets"
        right={<Badge tone="accent">{live} live</Badge>}
      />

      <Link
        href={`/c/${companyId}/content`}
        className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-os-dim transition-colors hover:text-os-text"
      >
        <ArrowLeft className="h-3 w-3" /> Content
      </Link>

      <p className="max-w-[720px] text-[12.5px] leading-relaxed text-os-muted">
        Every landing page and conversion asset shipped behind published content, with the live link
        on each row. Open it or copy it directly.
      </p>

      <LeadMagnetsTable rows={model.leadMagnets} showCopy manage />
    </div>
  )
}
