import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import type { Agent } from "../adapters/types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { checkRunLockStatus } from "./run-lock"

/** What the tree can honestly say about a command without running anything. */
export type RunSignal = {
  /** Epoch ms of the last run, from the log's mtime. Null = never run. */
  lastRunAt: number | null
  /** A run is in flight for this command's company right now. */
  running: boolean
}

/** Keyed `"<agentId>:<commandId>"`, the same key shape the pending list uses. */
export type RunSignals = Record<string, RunSignal>

const LOG_SUFFIX = ".log"

export type StatFn = (p: string) => Promise<{ mtimeMs: number }>
export type ReaddirFn = (p: string) => Promise<string[]>
export type LockFn = (dataDir: string) => Promise<{ running: boolean }>

/**
 * Per-command run state for the tree's gutter.
 *
 * Deliberately `stat`-only. This feeds a `force-dynamic` page, so it runs on
 * every render — v70's rule is to ask what a read costs when it happens fifty
 * times an hour, and the answer for `git log` is "a subprocess per company,
 * forever". A directory listing plus one stat per log file costs neither a
 * process nor a lock.
 *
 * **What it can and cannot know.** `<commandId>.run.json` is deleted when a
 * result is approved (commit-company-command-result-impl.ts), so it cannot
 * distinguish "approved" from "never ran". `<commandId>.log` is written by
 * every run and never deleted, so its mtime survives approval and is the one
 * durable answer to "has this ever run, and when".
 *
 * **There is no failure signal and this must not invent one.** Nothing records
 * a non-zero outcome. The log holds agent prose, and deciding "did it fail"
 * by reading that is a heuristic that would eventually mark a good run bad —
 * worse than saying nothing. `running` and the caller's pending set are the
 * only two states that carry urgency, and both are facts.
 */
export async function getRunSignals(
  agents: Agent[],
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR,
  readdirFn: ReaddirFn = (p) => readdir(p),
  statFn: StatFn = (p) => stat(p),
  lockFn: LockFn = checkRunLockStatus
): Promise<RunSignals> {
  const perAgent = await Promise.all(
    agents.map(async (agent) => {
      const dataDir = path.join(dataRoot, agent.id)

      let names: string[]
      try {
        names = await readdirFn(dataDir)
      } catch {
        // No data dir at all: nothing has ever run for this company. Not an
        // error — it is the state every company starts in.
        return [] as [string, RunSignal][]
      }

      // One lock check per COMPANY, not per command: the lock is company-wide
      // (one run at a time per company, see run-lock.ts), so asking per command
      // would be the same answer N times.
      let running = false
      try {
        running = (await lockFn(dataDir)).running
      } catch {
        running = false
      }

      const logs = names.filter((name) => name.endsWith(LOG_SUFFIX))
      const entries = await Promise.all(
        logs.map(async (name): Promise<[string, RunSignal] | null> => {
          const commandId = name.slice(0, -LOG_SUFFIX.length)
          try {
            const { mtimeMs } = await statFn(path.join(dataDir, name))
            return [`${agent.id}:${commandId}`, { lastRunAt: mtimeMs, running }]
          } catch {
            // Listed a moment ago and gone now, or unreadable. A missing log is
            // "never run" rather than a thrown page.
            return null
          }
        })
      )
      return entries.filter((e): e is [string, RunSignal] => e !== null)
    })
  )

  return Object.fromEntries(perAgent.flat())
}
