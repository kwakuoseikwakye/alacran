import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Two facts about one company's first run, kept in that company's run-data
 * directory beside its run records (`listPendingReviews` only reads
 * `*.run.json`, so this file cannot be mistaken for one). Own file, own
 * writers, the split `session-note-status.json` already uses.
 */
export type FirstRunState = { firstSavedAt?: string; dismissedAt?: string }

const FILE = "first-run.json"

/** A missing, corrupt or wrongly-typed file is "no marker", never an error. */
export async function readFirstRun(dir: string): Promise<FirstRunState> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(dir, FILE), "utf-8"))
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {}
    const record = raw as Record<string, unknown>
    const pick = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : undefined)
    return { firstSavedAt: pick("firstSavedAt"), dismissedAt: pick("dismissedAt") }
  } catch {
    return {}
  }
}

async function write(dir: string, state: FirstRunState): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, FILE), JSON.stringify(state), "utf-8")
}

// ponytail: read-modify-write with no lock. The writers are one person's
// approval and one person's dismiss click; a lost update costs one extra hero.
// Reach for lib/file-lock.ts if a scheduled writer ever joins.
export async function markFirstSaved(dir: string, now: () => Date = () => new Date()): Promise<void> {
  const state = await readFirstRun(dir)
  if (state.firstSavedAt) return
  await write(dir, { ...state, firstSavedAt: now().toISOString() })
}

export async function dismissFirstRun(dir: string, now: () => Date = () => new Date()): Promise<void> {
  const state = await readFirstRun(dir)
  if (state.dismissedAt) return
  await write(dir, { ...state, dismissedAt: now().toISOString() })
}
