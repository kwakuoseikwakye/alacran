import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises"
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

  // A pid that cannot be running: the kernel reserves 0, and writeFile/kill
  // both treat it as a special case, so this never signals a real process.
  const DEAD_PID = "999999"

  it("collects a lock whose writer is gone, instead of wedging forever", async () => {
    // Exactly what a hard quit or crash mid-run leaves on disk. Before this,
    // the file survived and every later run for that company — including every
    // scheduled one — reported "Already running" until someone found and
    // deleted it by hand.
    await mkdir(path.dirname(lockFilePath), { recursive: true })
    await writeFile(lockFilePath, DEAD_PID, "utf-8")

    expect(await checkLockStatus(lockFilePath)).toEqual({ running: false })
    expect(await acquireLock(lockFilePath)).toBe(true)
    expect(await readFile(lockFilePath, "utf-8")).toBe(String(process.pid))
  })

  it("holds a lock whose writer is still alive", async () => {
    await mkdir(path.dirname(lockFilePath), { recursive: true })
    await writeFile(lockFilePath, String(process.pid), "utf-8")

    expect(await checkLockStatus(lockFilePath)).toEqual({ running: true })
    expect(await acquireLock(lockFilePath)).toBe(false)
  })

  it("holds a lock it cannot read a pid out of, rather than guessing", async () => {
    // Errs toward held: a wrongly-held lock wedges one company until restart,
    // a wrongly-released one starts a second agent CLI on top of a live run.
    await mkdir(path.dirname(lockFilePath), { recursive: true })
    await writeFile(lockFilePath, "not a pid", "utf-8")

    expect(await checkLockStatus(lockFilePath)).toEqual({ running: true })
    expect(await acquireLock(lockFilePath)).toBe(false)
  })

  it("releasing a lock that doesn't exist does not throw", async () => {
    await expect(releaseLock(lockFilePath)).resolves.toBeUndefined()
  })
})
