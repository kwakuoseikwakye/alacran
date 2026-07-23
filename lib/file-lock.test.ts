import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { acquireLock, releaseLock, checkLockStatus } from "./file-lock"

let root: string
let lockFilePath: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "file-lock-test-"))
  lockFilePath = path.join(root, "nested", "some.lock")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("file-lock", () => {
  it("reports not running when no lock exists", async () => {
    expect(await checkLockStatus(lockFilePath)).toEqual({ running: false })
  })

  it("acquires the lock, creating parent dirs as needed, and reports running", async () => {
    expect(await acquireLock(lockFilePath)).toBe(true)
    expect(await checkLockStatus(lockFilePath)).toEqual({ running: true })
    expect(await readFile(lockFilePath, "utf-8")).toBe(String(process.pid))
  })

  it("fails to acquire a second time while the lock is held", async () => {
    expect(await acquireLock(lockFilePath)).toBe(true)
    expect(await acquireLock(lockFilePath)).toBe(false)
  })

  it("releases the lock, allowing a subsequent acquire to succeed", async () => {
    await acquireLock(lockFilePath)
    await releaseLock(lockFilePath)
    expect(await checkLockStatus(lockFilePath)).toEqual({ running: false })
    expect(await acquireLock(lockFilePath)).toBe(true)
  })

  it("releasing a lock that doesn't exist does not throw", async () => {
    await expect(releaseLock(lockFilePath)).resolves.toBeUndefined()
  })
})
