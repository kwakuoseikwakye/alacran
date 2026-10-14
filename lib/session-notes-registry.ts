import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { dataPath } from "./data-dir"

export type SessionNotesAssignment = { agentId: string; autoWrite: boolean }

/**
 * Whether a company writes its finished conversations down on its own.
 *
 * Its own file rather than a second field on `visible-runs.json`: that file is
 * named for what it holds, and a registry called "visible runs" that also
 * decides whether the app spends money on your account is the kind of thing
 * nobody finds at 3am. Same shape, same default-and-fallback behaviour, so
 * there is one pattern here rather than two.
 *
 * **Default ON**, which is the one place this deliberately differs from
 * `visible-run-registry`. The feature is the app's whole premise — a company
 * that remembers what was said to it — so the file records the opt-OUT. A user
 * who has never touched this has no entry and gets notes.
 */
const DEFAULT_REGISTRY_PATH = dataPath("session-notes.json")

export async function getSessionNotesAssignments(
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<SessionNotesAssignment[]> {
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

/** Absent means ON — see the note above. */
export async function getSessionNotesForAgent(
  agentId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<boolean> {
  const assignments = await getSessionNotesAssignments(registryPath)
  return assignments.find((a) => a.agentId === agentId)?.autoWrite ?? true
}

export async function setSessionNotesImpl(
  agentId: string,
  autoWrite: boolean,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  if (!agents.some((a) => a.id === agentId)) {
    return { ok: false, message: "Unknown company" }
  }
  const assignments = await getSessionNotesAssignments(registryPath)
  const withoutExisting = assignments.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, JSON.stringify([...withoutExisting, { agentId, autoWrite }], null, 2), "utf-8")
  return { ok: true }
}
