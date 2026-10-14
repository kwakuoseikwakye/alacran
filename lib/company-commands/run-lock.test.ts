import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { acquireRunLock, releaseRunLock, checkRunLockStatus } from "./run-lock"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "run-lock-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("run-lock", () => {
  it("reports not running when no lock exists", async () => {
    expect(await checkRunLockStatus(root)).toEqual({ running: false })
  })

  it("acquires the lock, creating the data dir if needed, and reports running", async () => {
    const acquired = await acquireRunLock(root)
    expect(acquired).toBe(true)
    expect(await checkRunLockStatus(root)).toEqual({ running: true })
    const lockContent = await readFile(path.join(root, "company-command.lock"), "utf-8")
    expect(lockContent).toBe(String(process.pid))
  })

  it("fails to acquire a second time while the lock is held", async () => {
    expect(await acquireRunLock(root)).toBe(true)
    expect(await acquireRunLock(root)).toBe(false)
  })

  it("releases the lock, allowing a subsequent acquire to succeed", async () => {
    await acquireRunLock(root)
    await releaseRunLock(root)
    expect(await checkRunLockStatus(root)).toEqual({ running: false })
    expect(await acquireRunLock(root)).toBe(true)
  })

  it("releasing a lock that doesn't exist does not throw", async () => {
    await expect(releaseRunLock(root)).resolves.toBeUndefined()
  })
})
