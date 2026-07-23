import path from "node:path"
import { acquireLock, releaseLock, checkLockStatus } from "../file-lock"

function lockPath(dataDir: string): string {
  return path.join(dataDir, "company-command.lock")
}

export async function checkRunLockStatus(dataDir: string): Promise<{ running: boolean }> {
  return checkLockStatus(lockPath(dataDir))
}

export async function acquireRunLock(dataDir: string): Promise<boolean> {
  return acquireLock(lockPath(dataDir))
}

export async function releaseRunLock(dataDir: string): Promise<void> {
  return releaseLock(lockPath(dataDir))
}
