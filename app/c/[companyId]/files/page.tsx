import { notFound } from "next/navigation"
import { WorkspaceView } from "@/components/os/workspace-view"
import { getEffectiveAgents } from "@/lib/get-effective-agents"

export const dynamic = "force-dynamic"

export default async function FilesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const agents = await getEffectiveAgents()
  if (!agents.some((a) => a.id === companyId)) notFound()

  return <WorkspaceView initialCompanyId={companyId} />
}
