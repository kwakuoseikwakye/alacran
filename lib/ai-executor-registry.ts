import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { dataPath } from "./data-dir"
import { getEffectiveAgents } from "./get-effective-agents"
import { AI_EXECUTORS, DEFAULT_AI_EXECUTOR_ID, getAiExecutor, type AiExecutor, type AiExecutorId } from "./ai-executors"

/**
 * Read-only from v99 until Kiro was verified: the one writer was the
 * per-company executor picker, deleted along with the three executors it
 * existed to choose between, because with a single registered executor there
 * was nothing to assign. v99's own note said re-adding an executor means
 * re-adding the writer alongside its picker rather than reviving a dangling
 * one — which is what happened here, in that order.
 *
 * An assignment naming a RETIRED executor still has to resolve to something
 * runnable rather than throwing (see `getAiExecutorIdForAgent`'s membership
 * check), because `ai-executors.json` exists on every pre-v99 disk and may
 * name codex, aider or antigravity.
 */

export type AiExecutorAssignment = { agentId: string; executorId: AiExecutorId }

const DEFAULT_REGISTRY_PATH = dataPath("ai-executors.json")

export async function getAiExecutorAssignments(
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<AiExecutorAssignment[]> {
  let raw: string
  try {
    raw = await readFile(registryPath, "utf-8")
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function getAiExecutorIdForAgent(
  agentId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<AiExecutorId> {
  const assignments = await getAiExecutorAssignments(registryPath)
  const entry = assignments.find((a) => a.agentId === agentId)
  return entry && entry.executorId in AI_EXECUTORS ? entry.executorId : DEFAULT_AI_EXECUTOR_ID
}

/**
 * Assign a company to an executor.
 *
 * Both ids are checked against the real key sets rather than trusted: agentId
 * against getEffectiveAgents, executorId against AI_EXECUTORS. A write naming
 * an executor that does not exist would resolve back to the default on every
 * read, which looks exactly like the picker silently not working.
 */
export async function setAiExecutorImpl(
  agentId: string,
  executorId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  if (!agents.some((a) => a.id === agentId)) {
    return { ok: false, message: "Unknown company" }
  }
  if (!(executorId in AI_EXECUTORS)) {
    return { ok: false, message: "Unknown AI executor" }
  }

  const assignments = await getAiExecutorAssignments(registryPath)
  const withoutExisting = assignments.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(
    registryPath,
    `${JSON.stringify([...withoutExisting, { agentId, executorId: executorId as AiExecutorId }], null, 2)}\n`,
    "utf-8"
  )
  return { ok: true }
}

export async function resolveAiExecutorForAgent(
  agentId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<AiExecutor> {
  return getAiExecutor(await getAiExecutorIdForAgent(agentId, registryPath))
}
