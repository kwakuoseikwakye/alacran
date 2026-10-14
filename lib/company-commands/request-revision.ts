"use server"

import { runCompanyCommandImpl } from "./run-company-command-impl"
import type { RevisionRequest } from "./revision"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { getEffectiveAgents } from "../get-effective-agents"
import { getCompanyCommand } from "./registry"

export async function requestRevision(commandId: string, agentId: string, request: RevisionRequest) {
  return runCompanyCommandImpl(commandId, {}, agentId, undefined, undefined, undefined, undefined, undefined, undefined, request)
}

export async function getRevisionHistory(commandId: string, agentId: string): Promise<{ createdAt: string; feedback: string; proposal: string }[]> {
  if (!getCompanyCommand(commandId) || !(await getEffectiveAgents()).some((agent) => agent.id === agentId)) return []
  const folder = path.join(COMPANY_COMMANDS_DATA_DIR, agentId, "revisions")
  const names = (await readdir(folder).catch(() => [] as string[])).filter((name) => name.startsWith(`${commandId}-`) && name.endsWith(".json"))
  const entries = await Promise.all(names.map(async (name) => {
    try {
      const entry = JSON.parse(await readFile(path.join(folder, name), "utf-8"))
      return typeof entry.createdAt === "string" && typeof entry.feedback === "string" && typeof entry.proposal === "string"
        ? { createdAt: entry.createdAt as string, feedback: entry.feedback as string, proposal: entry.proposal as string } : null
    } catch { return null }
  }))
  return entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)
}
