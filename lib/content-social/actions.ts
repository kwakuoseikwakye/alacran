"use server"

import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import { discardCompanyCommandFileImpl } from "../company-commands/discard-company-command-file-impl"
import { savePostImageImpl } from "./save-post-image-impl"
import { markPostPostedImpl } from "./mark-post-posted-impl"

type Result = { ok: boolean; message: string }

async function root(agentId: string): Promise<string | null> {
  return (await getEffectiveAgents()).find((a) => a.id === agentId)?.rootPath ?? null
}
const fail = (err: unknown): Result => ({ ok: false, message: err instanceof Error ? err.message : String(err) })

export async function discardPost(agentId: string, fileName: string): Promise<Result> {
  try {
    const r = await discardCompanyCommandFileImpl("make-posts", agentId, fileName)
    return { ok: r.discarded, message: r.message }
  } catch (err) { return fail(err) }
}

export async function savePostImage(agentId: string, fileName: string): Promise<Result> {
  try {
    const rootPath = await root(agentId)
    if (!rootPath) return { ok: false, message: "Unknown company" }
    const r = await savePostImageImpl(rootPath, fileName)
    return { ok: r.ok, message: r.message }
  } catch (err) { return fail(err) }
}

export async function markPostPosted(agentId: string, fileName: string): Promise<Result> {
  try {
    const rootPath = await root(agentId)
    if (!rootPath) return { ok: false, message: "Unknown company" }
    const today = new Date().toISOString().slice(0, 10)
    return await markPostPostedImpl(rootPath, fileName, today, path.join(COMPANY_COMMANDS_DATA_DIR, agentId, "make-posts.run.json"))
  } catch (err) { return fail(err) }
}
