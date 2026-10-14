import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { readRunningCommand, runningCommandPath, writeRunningCommand } from "./running-command"
import { runLockPath } from "./run-lock"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "running-command-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("running-command marker", () => {
  it("reads back what was written", async () => {
    await writeRunningCommand(dir, { commandId: "sync-finances", executorId: "codex", startedAt: "2026-10-03T09:00:00.000Z" })
    expect(await readRunningCommand(dir)).toEqual({ commandId: "sync-finances", executorId: "codex", startedAt: "2026-10-03T09:00:00.000Z" })
  })

  it("is null when nothing was written", async () => {
    expect(await readRunningCommand(dir)).toBeNull()
  })

  it("is null when the file is not a marker", async () => {
    await writeFile(runningCommandPath(dir), "{not json")
    expect(await readRunningCommand(dir)).toBeNull()
    await writeFile(runningCommandPath(dir), JSON.stringify({ startedAt: "2026-10-03T09:00:00.000Z" }))
    expect(await readRunningCommand(dir)).toBeNull()
  })

  it("keeps a marker whose AI is not a string, without the AI", async () => {
    await writeFile(runningCommandPath(dir), JSON.stringify({ commandId: "digest", executorId: 7, startedAt: "2026-10-03T09:00:00.000Z" }))
    expect(await readRunningCommand(dir)).toEqual({ commandId: "digest", executorId: null, startedAt: "2026-10-03T09:00:00.000Z" })
  })

  it("never throws when the folder is missing", async () => {
    await expect(writeRunningCommand(path.join(dir, "nope", "deeper"), { commandId: "x", executorId: null, startedAt: "2026-10-03T09:00:00.000Z" })).resolves.toBeUndefined()
  })

  it("is null when the lock cannot be checked, rather than trusting an unverified marker", async () => {
    await writeRunningCommand(dir, { commandId: "digest", executorId: null, startedAt: "2026-10-03T09:00:00.000Z" })
    // A lock path that loops on itself: stat fails with ELOOP, not "missing".
    await symlink(runLockPath(dir), runLockPath(dir))
    expect(await readRunningCommand(dir)).toBeNull()
  })

  it("replaces the marker in one step, leaving no temporary file behind", async () => {
    await writeRunningCommand(dir, { commandId: "digest", executorId: null, startedAt: "2026-10-03T09:00:00.000Z" })
    await writeRunningCommand(dir, { commandId: "refresh", executorId: "kimi", startedAt: "2026-10-03T09:05:00.000Z" })
    expect(await readRunningCommand(dir)).toEqual({ commandId: "refresh", executorId: "kimi", startedAt: "2026-10-03T09:05:00.000Z" })
    expect(await readdir(dir)).toEqual(["running-command.json"])
  })

  it("is null when startedAt is unparsable", async () => {
    await writeFile(runningCommandPath(dir), JSON.stringify({ commandId: "digest", executorId: "claude-code", startedAt: "not-a-date" }))
    expect(await readRunningCommand(dir)).toBeNull()
  })

  it("is null when the lock file is stale (newer than marker by more than 1000ms)", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await writeRunningCommand(dir, { commandId: "digest", executorId: "claude-code", startedAt: oneHourAgo })
    // Create a lock file with a current timestamp (now)
    await writeFile(runLockPath(dir), String(process.pid))
    expect(await readRunningCommand(dir)).toBeNull()
  })

  it("returns the marker when lock exists but is fresh (within 1000ms of marker)", async () => {
    const now = new Date().toISOString()
    await writeRunningCommand(dir, { commandId: "digest", executorId: "claude-code", startedAt: now })
    // Create lock file immediately after marker
    await writeFile(runLockPath(dir), String(process.pid))
    expect(await readRunningCommand(dir)).toEqual({ commandId: "digest", executorId: "claude-code", startedAt: now })
  })
})
