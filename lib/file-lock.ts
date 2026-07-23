import { mkdir, unlink, writeFile, access } from "node:fs/promises"
import path from "node:path"

export async function checkLockStatus(lockFilePath: string): Promise<{ running: boolean }> {
  try {
    await access(lockFilePath)
    return { running: true }
  } catch {
    return { running: false }
  }
}

export async function acquireLock(lockFilePath: string): Promise<boolean> {
  await mkdir(path.dirname(lockFilePath), { recursive: true })
  try {
    await writeFile(lockFilePath, String(process.pid), { flag: "wx" })
    return true
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "EEXIST") {
      return false
    }
    throw err
  }
}

export async function releaseLock(lockFilePath: string): Promise<void> {
  await unlink(lockFilePath).catch(() => {})
}
