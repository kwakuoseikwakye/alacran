import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { readJobsView } from "@/lib/jobs/view"
import { readSpendingView } from "@/lib/jobs/cost"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { JobsBoard } from "@/components/os/jobs/jobs-board"

export const dynamic = "force-dynamic"

export default async function JobsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const agent = (await getEffectiveAgents()).find((a) => a.id === companyId)
  if (!agent) notFound()
  const [view, spending] = await Promise.all([readJobsView(companyId, agent.rootPath), readSpendingView(companyId, agent.rootPath)])

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Unattended jobs"
        subtext="Your own scripts, run every day with no AI. New jobs practise first and send nothing. Anything they can't decide comes to Approvals. Below, an estimate of what this company's AI runs cost this month."
      />
      <JobsBoard companyId={companyId} view={view} spending={spending} now={Date.now()} />
    </div>
  )
}
