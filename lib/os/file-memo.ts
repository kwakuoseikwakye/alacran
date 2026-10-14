import { readFile as nodeReadFile, stat as nodeStat } from "node:fs/promises"

type ReadFn = (path: string) => Promise<string>
type StatFn = (path: string) => Promise<{ mtimeMs: number }>

const defaultRead: ReadFn = (p) => nodeReadFile(p, "utf8")
const defaultStat: StatFn = (p) => nodeStat(p)

/**
 * Process-wide memo for company files, keyed on path + mtime. Every OS surface
 * is `force-dynamic`, so without this each render re-parses an ontology that
 * has not changed since the app launched.
 *
 * Modelled on `lib/exec-memo.ts`, with one deliberate difference: no TTL. A
 * file has an mtime, so staleness is observable rather than guessed at.
 *
 * ponytail: in-process Map. Swap for SQLite under <company>/state/ only if a
 * real dataset makes a list view measurably slow — callers depend on this
 * signature, not on the internals.
 */
const cache = new Map<string, { mtimeMs: number; value: Promise<string> }>()

export function clearFileMemo(): void {
  cache.clear()
}

export async function memoizedReadFile(
  path: string,
  readFn: ReadFn = defaultRead,
  statFn: StatFn = defaultStat
): Promise<string> {
  const { mtimeMs } = await statFn(path)
  const hit = cache.get(path)
  if (hit && hit.mtimeMs === mtimeMs) return hit.value

  // A rejection is never cached: a file being mid-write must not pin an error.
  const value = readFn(path).catch((err: unknown) => {
    cache.delete(path)
    throw err
  })
  cache.set(path, { mtimeMs, value })
  return value
}
