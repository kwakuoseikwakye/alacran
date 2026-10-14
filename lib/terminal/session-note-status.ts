import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { dataPath } from "../data-dir"

/**
 * What happened the last time this company tried to write a session down.
 *
 * **Its own file, never a field on `session-notes.json`** — that one records
 * the user's opt-out and this one is written by a background tick every time
 * it has something to report. One file per writer is the same split v84 made
 * between `schedules.json` (browser-written) and `schedules-last-run.json`
 * (ticker-written), and for the same reason: it removes the race a lock would
 * otherwise be needed for, and a user's own setting never gets rewritten by
 * machinery.
 *
 * This exists because the failure it reports was invisible. `catchUpSessionNotes`
 * kept only `started` and dropped every message, so a company that could not
 * write its memory down looked exactly like a company with nothing to say.
 */
export type SessionNoteStatus = {
  /** ISO timestamp of the attempt. */
  at: string
  /** Did a write-up actually start? */
  started: boolean
  /** The sentence the attempt returned, shown to the user as-is. */
  message: string
}

const DEFAULT_STATUS_PATH = dataPath("session-note-status.json")

type StatusFile = Record<string, SessionNoteStatus>

async function readAll(statusPath: string): Promise<StatusFile> {
  let raw: string
  try {
    raw = await readFile(statusPath, "utf-8")
  } catch {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    // Same tolerance every registry in this app applies: a file written by a
    // newer version, or half-written, must never break the feature it
    // describes — it just reports nothing.
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as StatusFile) : {}
  } catch {
    return {}
  }
}

export async function getSessionNoteStatus(
  agentId: string,
  statusPath: string = DEFAULT_STATUS_PATH
): Promise<SessionNoteStatus | null> {
  const all = await readAll(statusPath)
  const found = all[agentId]
  // Field-checked rather than trusted: this is read straight into the UI, and
  // a half-written record showing "undefined" is worse than showing nothing.
  if (!found || typeof found.at !== "string" || typeof found.message !== "string") return null
  return { at: found.at, started: Boolean(found.started), message: found.message }
}

export async function setSessionNoteStatus(
  agentId: string,
  status: SessionNoteStatus,
  statusPath: string = DEFAULT_STATUS_PATH
): Promise<void> {
  const all = await readAll(statusPath)
  all[agentId] = status
  await mkdir(path.dirname(statusPath), { recursive: true })
  // Never throws into the tick: this is a report about a job, and losing the
  // report must not lose the job.
  await writeFile(statusPath, JSON.stringify(all, null, 2), "utf-8").catch(() => {})
}
