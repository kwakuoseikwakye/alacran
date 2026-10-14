import type { Agent } from "./adapters/types"
import { readNotionToken } from "./notion/read-notion-token"

export const NO_INTEGRATION_STATUS = "none configured yet"

export async function getIntegrationStatus(agent: Agent): Promise<string> {
  // The only integration this app detects per-company is a Notion connection
  // (NOTION_TOKEN in the company's own .env, never touched by this app beyond
  // this existence check — see lib/notion/read-notion-token.ts). A Google
  // connection is machine-wide, not per-company, so the Ownership Sheet reads
  // it from getConnectStatusImpl instead.
  if (await readNotionToken(agent.rootPath)) {
    return "Notion connected"
  }

  return NO_INTEGRATION_STATUS
}
