import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Agent } from "./adapters/types"

export async function getIntegrationStatus(agent: Agent): Promise<string> {
  if (agent.id !== "email-pipeline-agent") {
    return "none configured yet"
  }

  try {
    const raw = await readFile(path.join(agent.rootPath, "config.json"), "utf-8")
    const config = JSON.parse(raw) as { account?: unknown }
    if (typeof config.account === "string" && config.account.trim()) {
      return `Email connected (${config.account})`
    }
  } catch {
    return "none configured yet"
  }

  return "none configured yet"
}
