import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { readRunRecords, writeRunRecord, type RunRecord } from "./records"

let dir: string
beforeEach(() => void (dir = mkdtempSync(path.join(tmpdir(), "records-"))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: "r1",
  agentId: "acme",
  title: "Tidy pricing",
  task: "Tidy the pricing note",
  executorId: "claude-code",
  binaryName: "claude",
  status: "running",
  pid: 42,
  branch: "alacran/agent/r1",
  gitDir: "/repo/.git/worktrees/r1",
  baseSha: "abc123",
  worktreePath: "/w/r1",
  logPath: "/l/r1.log",
  startedAt: "2026-09-25T10:00:00.000Z",
  endedAt: null,
  reason: null,
  changedFiles: 0,
  summary: null,
  passOffset: 0,
  ...over,
})

describe("run records", () => {
  it("round-trips, oldest first", async () => {
    await writeRunRecord(dir, record({ id: "r2", startedAt: "2026-09-25T11:00:00.000Z" }))
    await writeRunRecord(dir, record())
    expect((await readRunRecords(dir)).map((r) => r.id)).toEqual(["r1", "r2"])
  })

  it("overwrites a record in place", async () => {
    await writeRunRecord(dir, record())
    await writeRunRecord(dir, record({ status: "needs-review", changedFiles: 2 }))
    expect(await readRunRecords(dir)).toEqual([record({ status: "needs-review", changedFiles: 2 })])
  })

  it("skips a file it can't read as a record, and a missing folder is empty", async () => {
    writeFileSync(path.join(dir, "broken.json"), "{not json")
    writeFileSync(path.join(dir, "other.json"), JSON.stringify({ id: 1 }))
    expect(await readRunRecords(dir)).toEqual([])
    expect(await readRunRecords(path.join(dir, "nope"))).toEqual([])
  })
})
