import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, rm, utimes, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { checkPollLockStatus } from "./poll-lock"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "poll-lock-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("checkPollLockStatus", () => {
  it("reports not running when the lock directory doesn't exist", async () => {
    const status = await checkPollLockStatus(root)
    expect(status).toEqual({ running: false, lockAgeSeconds: null })
  })

  it("reports running with a computed age when the lock directory exists", async () => {
    const lockPath = path.join(root, "state", "poll.lock")
    await mkdir(lockPath, { recursive: true })
    const tenSecondsAgo = new Date(Date.now() - 10_000)
    await utimes(lockPath, tenSecondsAgo, tenSecondsAgo)

    const status = await checkPollLockStatus(root)

    expect(status.running).toBe(true)
    expect(status.lockAgeSeconds).toBeGreaterThanOrEqual(9)
    expect(status.lockAgeSeconds).toBeLessThanOrEqual(12)
  })

  it("reports not running if the lock path can't be stat'd", async () => {
    const stateDir = path.join(root, "state")
    await mkdir(path.join(stateDir, "poll.lock"), { recursive: true })
    await chmod(stateDir, 0o000)

    try {
      const status = await checkPollLockStatus(root)
      expect(status).toEqual({ running: false, lockAgeSeconds: null })
    } finally {
      await chmod(stateDir, 0o755)
    }
  })
})
