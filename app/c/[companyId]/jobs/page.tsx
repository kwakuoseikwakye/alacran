import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { readJobsView } from "@/lib/jobs/view"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { JobsBoard } from "@/components/os/jobs/jobs-board"

export const dynamic = "force-dynamic"

export default async function JobsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const agent = (await getEffectiveAgents()).find((a) => a.id === companyId)
  if (!agent) notFound()
  const view = await readJobsView(companyId, agent.rootPath)

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Unattended jobs"
        subtext="Your own scripts, run every day with no AI. New jobs practise first and send nothing. Anything they can't decide comes to Approvals."
      />
      <JobsBoard companyId={companyId} view={view} now={Date.now()} />
    </div>
  )
}
