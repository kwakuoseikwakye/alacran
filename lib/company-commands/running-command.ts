import { readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { runLockPath } from "./run-lock"

/**
 * Which company command holds the run lock, for views that want to name it.
 *
 * The lock itself (run-lock.ts) holds only a pid, and a command's log is opened
 * in append mode and often stays silent until the end, so neither can say what
 * is running. This file can. It is written right after the lock is taken and
 * never deleted: a reader trusts it only while the lock is held. The runner
 * creates the lock before writing the marker, so if the lock file exists and
 * was last modified more than 1000ms after the marker's startedAt timestamp,
 * something took the lock after this marker was written (a later run, or an
 * approve/discard review) and the marker is stale. A finished or crashed run's
 * marker (lock missing) is returned if still valid.
 */
export type RunningCommand = { commandId: string; executorId: string | null; startedAt: string }

export function runningCommandPath(dataDir: string): string {
  return path.join(dataDir, "running-command.json")
}

/**
 * Best effort: a run must never fail because a view's hint could not be written. Written aside
 * and renamed into place, so a reader polling at that moment never sees half a marker.
 */
export async function writeRunningCommand(dataDir: string, value: RunningCommand): Promise<void> {
  const target = runningCommandPath(dataDir)
  const aside = `${target}.${process.pid}.tmp`
  try {
    await writeFile(aside, JSON.stringify(value), "utf-8")
    await rename(aside, target)
  } catch {
    await rm(aside, { force: true }).catch(() => {})
  }
}

/** Null when missing, unreadable, or stale (lock newer than marker); office then shows "Company command" without naming it. */
export async function readRunningCommand(dataDir: string): Promise<RunningCommand | null> {
  try {
    const value = JSON.parse(await readFile(runningCommandPath(dataDir), "utf-8")) as Record<string, unknown>
    if (typeof value.commandId !== "string" || typeof value.startedAt !== "string") return null

    // startedAt must be a valid ISO time
    const markerTime = Date.parse(value.startedAt)
    if (Number.isNaN(markerTime)) return null

    // Check if the lock file exists and is newer than the marker.
    // The runner creates the lock before writing the marker, so if the lock
    // is more than 1000ms newer, a different run holds the lock now.
    try {
      const lockStats = await stat(runLockPath(dataDir))
      if (lockStats.mtimeMs > markerTime + 1000) {
        return null
      }
    } catch (error) {
      // No lock file is normal once a run has finished; any other failure means the lock
      // cannot be checked, and an unverified marker must not name a job.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null
    }

    return {
      commandId: value.commandId,
      executorId: typeof value.executorId === "string" ? value.executorId : null,
      startedAt: value.startedAt,
    }
  } catch {
    return null
  }
}
