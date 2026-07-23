import { mkdir, unlink, writeFile, access } from "node:fs/promises"
import path from "node:path"

function lockPath(dataDir: string): string {
  return path.join(dataDir, "company-command.lock")
}

export async function checkRunLockStatus(dataDir: string): Promise<{ running: boolean }> {
  try {
    await access(lockPath(dataDir))
    return { running: true }
  } catch {
    return { running: false }
  }
}

export async function acquireRunLock(dataDir: string): Promise<boolean> {
  await mkdir(dataDir, { recursive: true })
  try {
    await writeFile(lockPath(dataDir), String(process.pid), { flag: "wx" })
    return true
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "EEXIST") {
      return false
    }
    throw err
  }
}

export async function releaseRunLock(dataDir: string): Promise<void> {
  await unlink(lockPath(dataDir)).catch(() => {})
}
