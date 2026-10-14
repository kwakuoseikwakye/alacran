import { COMPANY_COMMANDS } from "@/lib/company-commands/registry"
import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { getCompanyTerminalStatus } from "@/lib/terminal/sessions"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { CommandFlowEngine } from "@/components/os/workflows/command-flow-engine"

export const dynamic = "force-dynamic"

export default async function WorkflowsPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const allAgents = await getEffectiveAgents()
  const agent = allAgents.find((a) => a.id === companyId)
  if (!agent) notFound()

  const terminalStatus = getCompanyTerminalStatus(companyId)

  return (
    <div className="dash-content workflows-page space-y-6 pb-12">
      <PageHeader title="Workflows" />
      <CommandFlowEngine
        backgroundCommandIds={COMPANY_COMMANDS.filter((command) => !command.requiresLiveSession).map((command) => command.id)}
        companyId={companyId}
        companyRoot={agent.rootPath}
        terminalStatus={terminalStatus}
      />
    </div>
  )
}

