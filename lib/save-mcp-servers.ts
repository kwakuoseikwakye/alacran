"use server"

import { saveMcpServersImpl, type SaveMcpServersResult } from "./save-mcp-servers-impl"
import type { McpServer } from "./mcp-servers-config"

export async function saveMcpServers(agentId: string, servers: McpServer[]): Promise<SaveMcpServersResult> {
  return saveMcpServersImpl(agentId, servers)
}
