import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { getEffectiveAgents } from "../get-effective-agents"
import { getCompanyRemoteImpl } from "../github/backup-company-impl"
import { getIntegrationStatus } from "../get-integration-status"
import { getAiExecutorIdForAgent } from "../ai-executor-registry"
import { summarizeNetworkAccess } from "./summarize-network-access"
import type { ExecFileFn } from "../git-commit-file"
import type { AiExecutorId } from "../ai-executors"
import type { NetworkAccessEntry } from "./summarize-network-access"

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
      networkAccess: NetworkAccessEntry[]
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

  const integrationStatus = await getIntegrationStatus(agent)
  const hasIntegration = integrationStatus !== "none configured yet"

  const aiExecutorId = await getAiExecutorIdForAgent(agentId, aiExecutorRegistryPath)

  const networkAccess = summarizeNetworkAccess({ aiExecutorId, hasIntegration, remoteUrl })

  return {
    ok: true,
    rootPath: agent.rootPath,
    remoteUrl,
    integrationStatus,
    aiExecutorId,
    networkAccess,
  }
}
