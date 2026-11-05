import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises"
import path from "node:path"
import { dataPath } from "../data-dir"

/**
 * When each company last had an automatic note STARTED, and how many have been
 * started today machine-wide. Written at spawn time, before the process exists,
 * so a restart mid-run still counts the attempt — the in-memory `inFlight` set
 * cannot do that, and the launch tick re-evaluates every company.
 *
 * Its own file with one writer (the ticker), same split as
 * `session-note-status.json`.
 *
 * A MISSING file is empty (first run). An EXISTING file that cannot be parsed is
 * `corrupt`, and the caller treats it as "cap reached" — reading it as empty
 * would silently lift the cap and the 30-minute gap.
 *
 * ponytail: no lock. Two server processes (dev + packaged) could race; the worst
 * case is one extra spawn, bounded by the per-company gap. Add a lock if that
 * ever shows up.
 */
export type Attempts = {
  companies: Record<string, { lastAttemptAt: number; rateLimitReportedFor?: string }>
  /** `date` is the LOCAL date, so the cap resets at the user's midnight. */
  day: { date: string; count: number; capReported: string[] }
  /** Set by readAttempts only: the file existed but was unreadable/unparseable. */
  corrupt?: boolean
}

const DEFAULT_PATH = dataPath("session-note-attempts.json")

export function localDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function readAttempts(nowMs: number, storePath: string = DEFAULT_PATH): Promise<Attempts> {
  const empty: Attempts = { companies: {}, day: { date: localDate(nowMs), count: 0, capReported: [] } }
  let raw: string
  try {
    raw = await readFile(storePath, "utf-8")
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" ? empty : { ...empty, corrupt: true }
  }
  try {
    const p = JSON.parse(raw) as Partial<Attempts>
    if (!p || typeof p !== "object" || Array.isArray(p)) return { ...empty, corrupt: true }
    const companies = p.companies && typeof p.companies === "object" ? p.companies : {}
    const day = p.day
    // A different date means yesterday's count: reset it.
    if (!day || day.date !== empty.day.date || typeof day.count !== "number") return { companies, day: empty.day }
    return { companies, day: { date: day.date, count: day.count, capReported: Array.isArray(day.capReported) ? day.capReported : [] } }
  } catch {
    return { ...empty, corrupt: true }
  }
}

/**
 * Temp file + rename, so a crash mid-write cannot leave a half file that reads
 * back as "no attempts" and lifts the gates. Throws on failure on purpose: the
 * spawn-time caller must not spawn if this write did not land.
 */
export async function writeAttempts(attempts: Attempts, storePath: string = DEFAULT_PATH): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true })
  const tmp = `${storePath}.${process.pid}.tmp`
  const { corrupt: _corrupt, ...clean } = attempts
  try {
    await writeFile(tmp, JSON.stringify(clean, null, 2), "utf-8")
    await rename(tmp, storePath)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}
