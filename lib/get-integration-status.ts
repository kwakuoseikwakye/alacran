import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Agent } from "./adapters/types"
import { readNotionToken } from "./notion/read-notion-token"

export const NO_INTEGRATION_STATUS = "none configured yet"

export async function getIntegrationStatus(agent: Agent): Promise<string> {
  if (agent.id === "email-pipeline-agent") {
    try {
      const raw = await readFile(path.join(agent.rootPath, "config.json"), "utf-8")
      const config = JSON.parse(raw) as { account?: unknown }
      if (typeof config.account === "string" && config.account.trim()) {
        return `Email connected (${config.account})`
      }
    } catch {
      return NO_INTEGRATION_STATUS
    }
    return NO_INTEGRATION_STATUS
  }

  // Any other agent: the only integration this app knows how to detect is a
  // Notion connection made via the api-connect skill (NOTION_TOKEN in the
  // company's own .env, never touched by this app beyond this existence
  // check — see lib/notion/read-notion-token.ts).
  if (await readNotionToken(agent.rootPath)) {
    return "Notion connected"
  }

  return NO_INTEGRATION_STATUS
}
