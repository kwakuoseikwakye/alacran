import { stat } from "node:fs/promises"
import path from "node:path"

export type PollLockStatus = {
  running: boolean
  lockAgeSeconds: number | null
}

export async function checkPollLockStatus(rootPath: string): Promise<PollLockStatus> {
  const lockPath = path.join(rootPath, "state", "poll.lock")
  try {
    const stats = await stat(lockPath)
    const ageSeconds = Math.floor((Date.now() - stats.mtimeMs) / 1000)
    return { running: true, lockAgeSeconds: ageSeconds }
  } catch {
    return { running: false, lockAgeSeconds: null }
  }
}
