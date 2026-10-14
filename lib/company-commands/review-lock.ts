import { access } from "node:fs/promises"
import path from "node:path"
import { acquireRunLock, releaseRunLock } from "./run-lock"

/** Share the runner's lock for the complete review mutation, not just a
 * status check. Legacy direct saves without a run record have no proposal. */
export async function lockReview(dataDir: string, commandId: string): Promise<(() => Promise<void>) | null> {
  try { await access(path.join(dataDir, `${commandId}.run.json`)) } catch { return async () => {} }
  if (!(await acquireRunLock(dataDir))) return null
  return () => releaseRunLock(dataDir)
}
