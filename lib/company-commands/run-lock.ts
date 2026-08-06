import path from "node:path"
import { acquireLock, releaseLock, checkLockStatus } from "../file-lock"

/**
 * The single source of truth for where a company's run lock lives.
 *
 * Exported because a visible run (v35) hands this path to a generated bash
 * script that manages the lock itself — if that script re-derived the
 * filename by hand, a change here would silently leave every visible run
 * managing a lock file the rest of the app no longer looks at.
 */
export function runLockPath(dataDir: string): string {
  return path.join(dataDir, "company-command.lock")
}

export async function checkRunLockStatus(dataDir: string): Promise<{ running: boolean }> {
  return checkLockStatus(runLockPath(dataDir))
}

export async function acquireRunLock(dataDir: string): Promise<boolean> {
  return acquireLock(runLockPath(dataDir))
}

export async function releaseRunLock(dataDir: string): Promise<void> {
  return releaseLock(runLockPath(dataDir))
}
