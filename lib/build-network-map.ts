import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { getEffectiveAgents } from "./get-effective-agents"
import { getCompanyRemoteImpl } from "./github/backup-company-impl"
import { getAiExecutorIdForAgent } from "./ai-executor-registry"
import { getConnectStatusImpl } from "./connect/connect-status-impl"
import { readGoogleAccounts } from "./google-accounts-config"
import type { ExecFileFn } from "./git-commit-file"
import type { AgentKind } from "./adapters/types"
import type { AiExecutorId } from "./ai-executors"

const execFileAsync = promisify(nodeExecFile)
async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

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
 * inventing a capability that isn't real. A report-log agent (e.g. plh-ops)
 * has none of those buttons, so it's a genuinely isolated node — that's
 * honest, not a bug.
 *
 * NOTE: the final branch is a fall-through, not an exhaustive Record, so tsc
 * cannot catch a newly-added AgentKind silently acquiring github/google/notion
 * edges. Any new kind must be checked against this file by hand.
 */
export async function buildNetworkMap(
  execFn: ExecFileFn = defaultExecFile,
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
