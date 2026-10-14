import { readFile, writeFile, mkdir } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { dataPath } from "../data-dir"
import { AI_EXECUTORS } from "../ai-executors"
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  MAX_WORKSPACES_PER_COMPANY,
  cleanWorkspaceName,
  type Workspace,
} from "./workspace-model"

/**
 * A company's terminal workspaces, kept in their own file in the data directory
 * (one writer, never a field in another registry — the same split
 * `session-note-status.ts` explains). Which workspace a live terminal sits in is
 * NOT stored here: it rides on the session itself (`sessions.ts`), so it lives
 * and dies with the process.
 *
 * Read-modify-write with no lock: one person on one machine drives this, and a
 * lost update means a renamed workspace reverting, not lost work.
 */
const DEFAULT_PATH = dataPath("terminal-workspaces.json")

type Stored = Record<string, Workspace[]>
type Result = { ok: true; workspace: Workspace } | { ok: false; message: string }

async function readAll(file: string): Promise<Stored> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf-8"))
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Stored) : {}
  } catch {
    return {}
  }
}

/** Field-checked: this goes to the page, and a half-written entry showing
 *  "undefined" is worse than not showing it. An unregistered AI is dropped, so
 *  the workspace follows the company's instead of failing to launch. */
function clean(entries: unknown): Workspace[] {
  if (!Array.isArray(entries)) return []
  const out: Workspace[] = []
  for (const e of entries) {
    if (typeof e !== "object" || e === null) continue
    const { id, name, executorId } = e as Record<string, unknown>
    if (typeof id !== "string" || id === "") continue
    const cleaned = cleanWorkspaceName(name)
    if (!cleaned) continue
    out.push({ id, name: cleaned, ...(typeof executorId === "string" && executorId in AI_EXECUTORS ? { executorId } : {}) })
  }
  return out
}

/** Main always exists and always comes first; what is stored for it is only a rename. */
export async function listWorkspaces(agentId: string, file: string = DEFAULT_PATH): Promise<Workspace[]> {
  const stored = clean((await readAll(file))[agentId])
  const main = stored.find((w) => w.id === DEFAULT_WORKSPACE_ID) ?? { id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME }
  return [{ id: main.id, name: main.name }, ...stored.filter((w) => w.id !== DEFAULT_WORKSPACE_ID)]
}

async function save(agentId: string, workspaces: Workspace[], file: string): Promise<void> {
  const all = await readAll(file)
  all[agentId] = workspaces
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(all, null, 2)}\n`, "utf-8")
}

export async function createWorkspace(
  agentId: string,
  input: { name: unknown; executorId?: unknown },
  file: string = DEFAULT_PATH
): Promise<Result> {
  const name = cleanWorkspaceName(input.name)
  if (!name) return { ok: false, message: "Give the workspace a name of 1 to 40 characters." }
  const wanted = typeof input.executorId === "string" ? input.executorId : ""
  if (wanted !== "" && !(wanted in AI_EXECUTORS)) return { ok: false, message: "Unknown AI." }
  const current = await listWorkspaces(agentId, file)
  if (current.length >= MAX_WORKSPACES_PER_COMPANY) {
    return { ok: false, message: `That's ${MAX_WORKSPACES_PER_COMPANY} workspaces, which is the limit. Delete one you've finished with.` }
  }
  const workspace: Workspace = { id: `w${randomUUID().replace(/-/g, "").slice(0, 12)}`, name, ...(wanted ? { executorId: wanted } : {}) }
  await save(agentId, [...current, workspace], file)
  return { ok: true, workspace }
}

/**
 * Change a workspace's name and, when `executorId` is given, its AI ("" returns
 * it to following the company's). Absent leaves the AI alone, which is also all
 * Main ever does: its AI is the company's, set where the company's AI is set.
 */
export async function updateWorkspace(
  agentId: string,
  id: string,
  input: { name: unknown; executorId?: unknown },
  file: string = DEFAULT_PATH
): Promise<Result> {
  const name = cleanWorkspaceName(input.name)
  if (!name) return { ok: false, message: "Give the workspace a name of 1 to 40 characters." }
  const wanted = typeof input.executorId === "string" ? input.executorId : undefined
  if (wanted !== undefined && wanted !== "" && !(wanted in AI_EXECUTORS)) return { ok: false, message: "Unknown AI." }
  const current = await listWorkspaces(agentId, file)
  const found = current.find((w) => w.id === id)
  if (!found) return { ok: false, message: "That workspace isn't here any more." }
  const { executorId: kept, ...rest } = found
  const executorId = id === DEFAULT_WORKSPACE_ID ? undefined : wanted === undefined ? kept : wanted || undefined
  const updated: Workspace = { ...rest, name, ...(executorId ? { executorId } : {}) }
  await save(agentId, current.map((w) => (w.id === id ? updated : w)), file)
  return { ok: true, workspace: updated }
}

/** Main cannot go: it is where a session with no workspace belongs. Whether the
 *  workspace still holds live terminals is the caller's check, because only the
 *  caller can see the sessions. */
export async function deleteWorkspace(agentId: string, id: string, file: string = DEFAULT_PATH): Promise<Result> {
  if (id === DEFAULT_WORKSPACE_ID) return { ok: false, message: "The main workspace can't be deleted." }
  const current = await listWorkspaces(agentId, file)
  const found = current.find((w) => w.id === id)
  if (!found) return { ok: false, message: "That workspace isn't here any more." }
  await save(agentId, current.filter((w) => w.id !== id), file)
  return { ok: true, workspace: found }
}
