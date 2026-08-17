import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { getEffectiveAgents } from "../get-effective-agents"
import { getCompanyRemoteImpl } from "../github/backup-company-impl"
import { getIntegrationStatus, NO_INTEGRATION_STATUS } from "../get-integration-status"
import { getAiExecutorIdForAgent } from "../ai-executor-registry"
import { getConnectStatusImpl } from "../connect/connect-status-impl"
import { readMcpServers } from "../mcp-servers-config"
import { summarizeNetworkAccess } from "./summarize-network-access"
import type { ExecFileFn } from "../git-commit-file"
import type { AiExecutorId } from "../ai-executors"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type CompanyOwnership =
  | {
      ok: true
      rootPath: string
      remoteUrl: string | null
      integrationStatus: string
      aiExecutorId: AiExecutorId
      networkAccess: string[]
    }
  | { ok: false; message: string }

export async function getCompanyOwnershipImpl(
  agentId: string,
  execFn: ExecFileFn = defaultExecFile,
  aiExecutorRegistryPath?: string
): Promise<CompanyOwnership> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }

  const remoteResult = await getCompanyRemoteImpl(agentId, execFn)
  const remoteUrl = remoteResult.ok ? remoteResult.remoteUrl : null

  const perCompanyStatus = await getIntegrationStatus(agent)
  const connectStatus = await getConnectStatusImpl(execFn)
  const googleConnected = connectStatus.google.connected

  // getIntegrationStatus only reports a per-company Notion connection, never
  // a Google one. So fall back to the machine-wide Google connection here:
  // gog's auth is per-machine,
  // not per-company, so if it's connected at all, any company's commands
  // could use it, and this dashboard should say so rather than a blanket
  // "none configured yet" that isn't true.
  const integrationStatus =
    perCompanyStatus !== NO_INTEGRATION_STATUS
      ? perCompanyStatus
      : googleConnected
        ? `${connectStatus.google.detail} (Google is connected on this machine — any company's commands can use it.)`
        : NO_INTEGRATION_STATUS

  const hasIntegration = perCompanyStatus !== NO_INTEGRATION_STATUS || googleConnected

  const aiExecutorId = await getAiExecutorIdForAgent(agentId, aiExecutorRegistryPath)

  const mcpServers = await readMcpServers(agent.rootPath)

  const networkAccess = summarizeNetworkAccess({ aiExecutorId, hasIntegration, remoteUrl, mcpServers })

  return {
    ok: true,
    rootPath: agent.rootPath,
    remoteUrl,
    integrationStatus,
    aiExecutorId,
    networkAccess,
  }
}
