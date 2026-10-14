import { getConnectStatus } from "@/lib/connect/connect-actions"
import { allConnectorStatuses } from "@/lib/os/connectors/statuses"
import { readEnvLocal } from "@/lib/os/connectors/creds"
import {
  connectionCatalog,
} from "@/lib/os/connectors/integrations-catalog"
import { readMcpPool } from "@/lib/mcp-pool"
import { UnifiedConnectionsBoard } from "@/components/os/connectors/unified-connections-board"

export const dynamic = "force-dynamic"

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    view?: "all" | "marketplace" | "machine"
    tab?: "all" | "marketplace" | "machine"
  }>
}) {
  const { view, tab } = (await searchParams) ?? {}
  const requestedView = view ?? tab
  const initialViewMode =
    requestedView === "marketplace" || requestedView === "machine" ? requestedView : "all"

  const [connectStatus, statuses, mcpPool] = await Promise.all([
    getConnectStatus(),
    allConnectorStatuses(null),
    readMcpPool(),
  ])

  const envLocal = readEnvLocal()
  const catalog = connectionCatalog(statuses, envLocal, mcpPool)

  return (
    <UnifiedConnectionsBoard
      initialConnectStatus={connectStatus}
      initialCatalog={catalog}
      initialViewMode={initialViewMode}
    />
  )
}
