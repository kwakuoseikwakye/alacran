import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { dataPath } from "./data-dir"
import { AI_EXECUTORS, DEFAULT_AI_EXECUTOR_ID, getAiExecutor, type AiExecutor, type AiExecutorId } from "./ai-executors"

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

export async function resolveAiExecutorForAgent(
  agentId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<AiExecutor> {
  return getAiExecutor(await getAiExecutorIdForAgent(agentId, registryPath))
}

export async function setAiExecutorImpl(
  agentId: string,
  executorId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  if (!agents.some((a) => a.id === agentId)) {
    return { ok: false, message: "Unknown agent" }
  }
  if (!(executorId in AI_EXECUTORS)) {
    return { ok: false, message: "Unknown AI executor" }
  }

  const assignments = await getAiExecutorAssignments(registryPath)
  const withoutExisting = assignments.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(
    registryPath,
    JSON.stringify([...withoutExisting, { agentId, executorId: executorId as AiExecutorId }], null, 2),
    "utf-8"
  )
  return { ok: true }
}
