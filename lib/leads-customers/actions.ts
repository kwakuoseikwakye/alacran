"use server"

import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import { discardCompanyCommandFileImpl } from "../company-commands/discard-company-command-file-impl"
import { markProspectContactedImpl } from "./mark-prospect-contacted-impl"

type Result = { ok: boolean; message: string }

async function root(agentId: string): Promise<string | null> {
  return (await getEffectiveAgents()).find((a) => a.id === agentId)?.rootPath ?? null
}

const fail = (err: unknown): Result => ({
  ok: false,
  message: err instanceof Error ? err.message : String(err),
})

export async function discardProspect(agentId: string, fileName: string): Promise<Result> {
  try {
    const r = await discardCompanyCommandFileImpl("research-prospects", agentId, fileName)
    return { ok: r.discarded, message: r.message }
  } catch (err) {
    return fail(err)
  }
}

export async function markProspectContacted(agentId: string, fileName: string): Promise<Result> {
  try {
    const rootPath = await root(agentId)
    if (!rootPath) return { ok: false, message: "Unknown company" }
    const today = new Date().toISOString().slice(0, 10)
    return await markProspectContactedImpl(
      rootPath,
      fileName,
      today,
      path.join(COMPANY_COMMANDS_DATA_DIR, agentId, "research-prospects.run.json")
    )
  } catch (err) {
    return fail(err)
  }
}
