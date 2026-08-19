import { mkdir, unlink, writeFile, readFile } from "node:fs/promises"
import path from "node:path"

/**
 * A lock file holds the pid of the process that took it, and a lock whose
 * writer no longer exists is not a lock.
 *
 * Without this check, one hard quit — or a crash — during a run left the file
 * behind forever: nothing sweeps it, so every later run for that company
 * reported "Already running", including every scheduled one, silently, with no
 * way out but finding and deleting a file inside the app's data directory.
 *
 * The recorded pid is the SERVER's, not the spawned agent's, which is exactly
 * the right proxy: while the server lives, only its own exit handlers touch
 * this lock, and once it dies the lock is garbage by definition.
 *
 * Errs toward "still held" on anything ambiguous — an unreadable or malformed
 * file, or EPERM from a pid owned by another user. A wrongly-held lock wedges
 * one company until restart; a wrongly-released one starts a second agent CLI
 * on top of a live run.
 *
 * ponytail: pid liveness only, no boot-time or start-time check, so a pid
 * recycled onto an unrelated process still reads as held. Same outcome as
 * today's bug and far rarer; compare `ps -p <pid> -o lstart=` if it ever bites.
 * A visible run (whose bash wrapper owns the lock through its own `trap EXIT`)
 * records the server's pid too, so restarting the server mid-run makes that
 * lock collectable — narrow, and it replaces a permanent wedge.
 */
async function isAbandoned(lockFilePath: string): Promise<boolean> {
  let pid: number
  try {
    pid = Number((await readFile(lockFilePath, "utf-8")).trim())
  } catch {
    return false
  }
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    // Signal 0 checks for existence without delivering anything.
    process.kill(pid, 0)
    return false
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH"
  }
}

export async function checkLockStatus(lockFilePath: string): Promise<{ running: boolean }> {
  try {
    await readFile(lockFilePath, "utf-8")
  } catch {
    return { running: false }
  }
  return { running: !(await isAbandoned(lockFilePath)) }
}

export async function acquireLock(lockFilePath: string): Promise<boolean> {
  await mkdir(path.dirname(lockFilePath), { recursive: true })
  try {
    await writeFile(lockFilePath, String(process.pid), { flag: "wx" })
    return true
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "EEXIST") {
      // Collect the previous holder's abandoned lock and take it. One retry,
      // not a loop: if the retry also hits EEXIST, another process won the race
      // between the unlink and the write, and it deserves the lock.
      if (!(await isAbandoned(lockFilePath))) return false
      await unlink(lockFilePath).catch(() => {})
      try {
        await writeFile(lockFilePath, String(process.pid), { flag: "wx" })
        return true
      } catch {
        return false
      }
    }
    throw err
  }
}

export async function releaseLock(lockFilePath: string): Promise<void> {
  await unlink(lockFilePath).catch(() => {})
}
