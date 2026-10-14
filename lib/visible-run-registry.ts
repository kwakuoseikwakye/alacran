import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { dataPath } from "./data-dir"

export type VisibleRunAssignment = { agentId: string; runVisibly: boolean }

const DEFAULT_REGISTRY_PATH = dataPath("visible-runs.json")

export async function getVisibleRunAssignments(
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<VisibleRunAssignment[]> {
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

export async function getVisibleRunForAgent(
  agentId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<boolean> {
  const assignments = await getVisibleRunAssignments(registryPath)
  const entry = assignments.find((a) => a.agentId === agentId)
  return entry?.runVisibly ?? false
}

export async function setVisibleRunImpl(
  agentId: string,
  runVisibly: boolean,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  if (!agents.some((a) => a.id === agentId)) {
    return { ok: false, message: "Unknown agent" }
  }

  const assignments = await getVisibleRunAssignments(registryPath)
  const withoutExisting = assignments.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(
    registryPath,
    JSON.stringify([...withoutExisting, { agentId, runVisibly }], null, 2),
    "utf-8"
  )
  return { ok: true }
}
