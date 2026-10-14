import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { readOutcomes, WITHHELD, type OutcomeEntry } from "./outcomes"

export const OFFER_THRESHOLD = 3
export const CURSOR_FILE = "preferences-cursor.json"
export type PreferenceOffer = { commands: { id: string; revisions: number }[] }

/** Pure: which commands have at least OFFER_THRESHOLD revisions (with feedback text) in these entries. */
export function offerFrom(entries: OutcomeEntry[]): PreferenceOffer | null {
  const counts = new Map<string, number>()
  for (const e of entries) {
    if (e.command === "learn-preferences" || e.feedback === WITHHELD) continue
    if (e.outcome === "revised" && e.feedback) counts.set(e.command, (counts.get(e.command) ?? 0) + 1)
  }
  const commands = [...counts]
    .filter(([, revisions]) => revisions >= OFFER_THRESHOLD)
    .map(([id, revisions]) => ({ id, revisions }))
    .sort((a, b) => b.revisions - a.revisions || (a.id < b.id ? -1 : 1))
  return commands.length ? { commands } : null
}

export async function readCursor(dataDir: string): Promise<number> {
  try {
    const parsed = JSON.parse(await readFile(path.join(dataDir, CURSOR_FILE), "utf-8")) as { offset?: unknown }
    return typeof parsed.offset === "number" && Number.isInteger(parsed.offset) && parsed.offset >= 0 ? parsed.offset : 0
  } catch {
    return 0
  }
}

/** One writer (the run that starts a learn-preferences job). Atomic: write a temp file, then rename. */
export async function writeCursor(dataDir: string, offset: number): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  const file = path.join(dataDir, CURSOR_FILE)
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify({ offset, at: new Date().toISOString() }), { mode: 0o600 })
  await rename(tmp, file)
}

export async function loadPreferenceOffer(dataDir: string): Promise<PreferenceOffer | null> {
  const { entries } = await readOutcomes(dataDir, await readCursor(dataDir))
  return offerFrom(entries)
}
