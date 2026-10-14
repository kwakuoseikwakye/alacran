"use server"

import { getConnectStatusImpl } from "./connect-status-impl"
import { clearExecMemo } from "../exec-memo"
import type { ConnectStatus } from "./connect-status-impl"

export async function getConnectStatus(): Promise<ConnectStatus> {
  return getConnectStatusImpl()
}

/**
 * What the Re-check button calls. Drops the probe memo so underlying
 * `which`/`gog auth`/`gh` calls really run again.
 */
export async function recheckConnectStatus(): Promise<ConnectStatus> {
  clearExecMemo()
  return getConnectStatusImpl()
}

/**
 * What the Connections page's Re-check button calls. Machine-only, always —
 * this page is nav-labelled `scope: "system"`, so its statuses must never
 * flex with whichever company happens to be active elsewhere in the app (see
 * allConnectorStatuses' own doc comment: `agentRootPath: null` is "the
 * system Connections page's view"). It used to resolve an `activeCompanyId`
 * and pass that company's rootPath through, which silently turned a
 * machine-wide page into a view of one company depending on an invisible
 * cookie — the bug this whole per-company-connections feature started from.
 */
export async function recheckAllConnectionsState(): Promise<{
  connectStatus: ConnectStatus
  catalog: import("@/lib/os/connectors/integrations-catalog").CatalogEntry[]
}> {
  clearExecMemo()
  const { allConnectorStatuses } = await import("@/lib/os/connectors/statuses")
  const { readEnvLocal } = await import("@/lib/os/connectors/creds")
  const { connectionCatalog } = await import("@/lib/os/connectors/integrations-catalog")
  const { readMcpPool } = await import("@/lib/mcp-pool")

  const [connectStatus, statuses, mcpPool] = await Promise.all([
    getConnectStatusImpl(),
    allConnectorStatuses(null),
    readMcpPool(),
  ])

  const envLocal = readEnvLocal()
  return {
    connectStatus,
    catalog: connectionCatalog(statuses, envLocal, mcpPool),
  }
}
