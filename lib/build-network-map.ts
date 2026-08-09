import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { getCompanyRemoteImpl } from "./github/backup-company-impl"
import { getAiExecutorIdForAgent } from "./ai-executor-registry"
import { getConnectStatusImpl } from "./connect/connect-status-impl"
import { readGoogleAccounts } from "./google-accounts-config"
import type { ExecFileFn } from "./git-commit-file"
import type { Agent, AgentKind } from "./adapters/types"
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

async function readPipelineEmail(agent: Agent): Promise<string | null> {
  try {
    const raw = await readFile(path.join(agent.rootPath, "config.json"), "utf-8")
    const config = JSON.parse(raw) as { account?: unknown }
    return typeof config.account === "string" && config.account.trim() ? config.account.trim() : null
  } catch {
    return null
  }
}

/**
 * Composes the "what is this company actually plugged into" view for the
 * /network page out of the same primitives the Ownership Sheet
 * (lib/ownership) and Connect page (lib/connect) already use — no new
 * detection logic, only a different shape (structured per-service edges
 * instead of a formatted sentence) so the graph can pick an icon and a
 * connected/not-connected line per service.
 *
 * Only ever produces edges for a service a company's *kind* actually
 * supports elsewhere in this app (see AgentCard's show* flags): a pipeline
 * agent has no GitHub-backup button anywhere, so it gets no GitHub edge
 * here either, rather than inventing a capability that isn't real. A
 * report-log agent (e.g. plh-ops) has none of these buttons, so it's a
 * genuinely isolated node — that's honest, not a bug.
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
      if (agent.kind === "pipeline") {
        const email = await readPipelineEmail(agent)
        return {
          id: agent.id,
          name: agent.name,
          kind: agent.kind,
          aiExecutorId: null,
          edges: [
            {
              service: "google",
              connected: Boolean(email),
              detail: email ? `Email connected (${email})` : "No email connected yet",
            },
          ],
        }
      }

      if (agent.kind === "report-log") {
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
