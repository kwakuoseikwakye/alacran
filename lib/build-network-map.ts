import { memoizedExecFile } from "./exec-memo"
import { getEffectiveAgents } from "./get-effective-agents"
import { getCompanyRemoteImpl } from "./github/backup-company-impl"
import { getAiExecutorIdForAgent } from "./ai-executor-registry"
import { getConnectStatusImpl } from "./connect/connect-status-impl"
import { readGoogleAccounts } from "./google-accounts-config"
import type { ExecFileFn } from "./git-commit-file"
import type { AgentKind } from "./adapters/types"
import type { AiExecutorId } from "./ai-executors"

export type NetworkService = "google" | "github" | "notion"

export type NetworkEdge = { service: NetworkService; connected: boolean; detail: string }

export type NetworkCompany = {
  id: string
  name: string
  kind: AgentKind
  aiExecutorId: AiExecutorId | null
  edges: NetworkEdge[]
}

export type NetworkMap = { companies: NetworkCompany[]; executorsInUse: AiExecutorId[] }

/**
 * Composes the "what is this company actually plugged into" view for the
 * /network page out of the same primitives the Ownership Sheet
 * (lib/ownership) and Connect page (lib/connect) already use — no new
 * detection logic, only a different shape (structured per-service edges
 * instead of a formatted sentence) so the graph can pick an icon and a
 * connected/not-connected line per service.
 *
 * Only ever produces edges for a service a company's *kind* actually
 * supports elsewhere in this app (see AgentCard's show* flags), rather than
 * inventing a capability that isn't real. A report-log agent
 * has none of those buttons, so it's a genuinely isolated node — that's
 * honest, not a bug.
 *
 * NOTE: the final branch is a fall-through, not an exhaustive Record, so tsc
 * cannot catch a newly-added AgentKind silently acquiring github/google/notion
 * edges. Any new kind must be checked against this file by hand.
 */
export async function buildNetworkMap(
  /**
   * Memoized by default (v70), and that default is load-bearing: this forwards
   * straight into `getConnectStatusImpl`, whose own default IS memoized — so
   * passing a plain exec here silently opted the whole Networks page out of the
   * memo and re-ran every CLI probe on every render. Measured at **2.06s per
   * render, warm or cold**, of which `kiro-cli whoami` alone is 2.2s, where
   * /connect answered from cache in 10ms. Exactly the mistake v75 recorded
   * about `listGoogleAccounts`, at a different call site.
   *
   * Safe to memoize everything in this module: every probe it reaches is
   * read-only, and unlike the Connect page there is no "Re-check" here whose
   * whole job is to look again.
   */
  execFn: ExecFileFn = (command, args) => memoizedExecFile(command, args),
  aiExecutorRegistryPath?: string
): Promise<NetworkMap> {
  const agents = await getEffectiveAgents()
  const connectStatus = await getConnectStatusImpl(execFn)
  const notionByAgent = new Map(connectStatus.notion.companies.map((c) => [c.agentId, c.connected]))

  const companies = await Promise.all(
    agents.map(async (agent): Promise<NetworkCompany> => {

      // All three are genuinely isolated nodes, and must be listed here rather
      // than left to fall through to the company branch below: that branch
      // draws github/google/notion/executor edges, and these kinds support
      // none of those anywhere else in the app — no executor picker, no Google
      // picker, no MCP, no backup. Drawing them would invent a capability,
      // which is the one thing this map must not do.
      //
      // `pipeline` is currently unreachable (no built-in or registered company
      // uses it) but stays listed: it is still a valid AgentKind, and the
      // fall-through below is what would silently grant it every edge.
      if (agent.kind === "report-log" || agent.kind === "external" || agent.kind === "pipeline") {
        return { id: agent.id, name: agent.name, kind: agent.kind, aiExecutorId: null, edges: [] }
      }

      const [aiExecutorId, remote, assignedAccounts] = await Promise.all([
        getAiExecutorIdForAgent(agent.id, aiExecutorRegistryPath),
        getCompanyRemoteImpl(agent.id, execFn),
        readGoogleAccounts(agent.rootPath),
      ])
      const remoteUrl = remote.ok ? remote.remoteUrl : null
      const googleConnected = assignedAccounts.length > 0 || connectStatus.google.connected
      const notionConnected = notionByAgent.get(agent.id) ?? false

      return {
        id: agent.id,
        name: agent.name,
        kind: agent.kind,
        aiExecutorId,
        edges: [
          {
            service: "github",
            connected: Boolean(remoteUrl),
            detail: remoteUrl ? `Backed up to ${remoteUrl}` : "Not backed up to GitHub yet",
          },
          {
            service: "google",
            connected: googleConnected,
            detail:
              assignedAccounts.length > 0
                ? `Assigned: ${assignedAccounts.join(", ")}`
                : connectStatus.google.connected
                  ? "Using this machine's connected Google account"
                  : "No Google account connected yet",
          },
          {
            service: "notion",
            connected: notionConnected,
            detail: notionConnected ? "Notion connected" : "Notion not connected yet",
          },
        ],
      }
    })
  )

  const executorsInUse = Array.from(
    new Set(companies.map((c) => c.aiExecutorId).filter((id): id is AiExecutorId => id !== null))
  )

  return { companies, executorsInUse }
}
