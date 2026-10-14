import type { RunSummary } from "./run-engine"
import type { RunChange } from "./landing"

export type { RunSummary }
export type ApiResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string; files?: string[] }

const base = (agentId: string) => `/api/terminal/${encodeURIComponent(agentId)}`

/** Every action is a JSON POST (the route's CSRF guard) and every answer is
 *  either the data or a sentence to show — never a status code. */
async function post<T extends object>(agentId: string, body: object): Promise<ApiResult<T>> {
  try {
    const response = await fetch(base(agentId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (response.ok) return { ok: true, ...(data as T) }
    return {
      ok: false,
      message: typeof data.message === "string" ? data.message : "That didn't work. Try again.",
      files: Array.isArray(data.files) ? (data.files as string[]) : undefined,
    }
  } catch {
    return { ok: false, message: "Couldn't reach Alacrán. Try again." }
  }
}

async function get<T>(agentId: string, query: string): Promise<T | null> {
  try {
    const response = await fetch(`${base(agentId)}?${query}`)
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

export const runsApi = {
  list: async (agentId: string) => (await get<{ runs: RunSummary[] }>(agentId, "runs=1"))?.runs ?? null,
  changes: (agentId: string, run: string) =>
    get<{ files: RunChange[]; ignored: string[] }>(agentId, `run=${encodeURIComponent(run)}&changes=1`),
  fileDiff: (agentId: string, run: string, file: string) =>
    get<{ before: string; after: string; notice?: string }>(agentId, `run=${encodeURIComponent(run)}&file=${encodeURIComponent(file)}`),
  start: (agentId: string, task: string, title?: string) =>
    post<{ id: string; label: string; dirty: boolean }>(agentId, { type: "start-run", task, title }),
  keep: (agentId: string, run: string) => post<{ message: string }>(agentId, { type: "keep-run", run }),
  discard: (agentId: string, run: string) => post<{ message: string }>(agentId, { type: "discard-run", run }),
  ask: (agentId: string, run: string, feedback: string) => post<{ label: string }>(agentId, { type: "ask-run", run, feedback }),
  takeOver: (agentId: string, run: string) => post<{ id: string; label: string }>(agentId, { type: "take-over", run }),
}
