import { describe, it, expect } from "vitest"
import { mkdtemp, writeFile, readdir, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { readAttempts, writeAttempts, localDate } from "./session-note-attempts"

const tmp = async () => path.join(await mkdtemp(path.join(os.tmpdir(), "alacran-att-")), "a.json")

describe("session-note-attempts", () => {
  it("round-trips and resets the day count on a new local date", async () => {
    const p = await tmp()
    const t = new Date("2026-11-05T10:00:00").getTime()
    const a = await readAttempts(t, p)
    a.day.count = 2
    a.companies.co = { lastAttemptAt: t }
    await writeAttempts(a, p)
    expect((await readAttempts(t, p)).day.count).toBe(2)
    const next = await readAttempts(t + 24 * 3600_000, p)
    expect(next.day.date).toBe(localDate(t + 24 * 3600_000))
    expect(next.day.count).toBe(0)
    expect(next.companies.co.lastAttemptAt).toBe(t)
  })

  it("treats a corrupt file as empty", async () => {
    const p = await tmp()
    await writeFile(p, "{nope")
    expect((await readAttempts(Date.now(), p)).day.count).toBe(0)
  })

  it("writes atomically: no temp file is left beside the store", async () => {
    const p = await tmp()
    await writeAttempts(await readAttempts(Date.now(), p), p)
    expect(await readdir(path.dirname(p))).toEqual(["a.json"])
  })

  it("reads a missing file as empty but an unparseable existing one as corrupt", async () => {
    const p = await tmp()
    expect((await readAttempts(Date.now(), p)).corrupt).toBeUndefined()
    await writeFile(p, "{nope")
    expect((await readAttempts(Date.now(), p)).corrupt).toBe(true)
    await writeFile(p, "[]")
    expect((await readAttempts(Date.now(), p)).corrupt).toBe(true)
  })

  it("cleans up its temp file when the rename fails", async () => {
    const p = await tmp()
    await mkdir(p) // a directory where the file should go: rename onto it fails
    await expect(writeAttempts(await readAttempts(Date.now(), p + "x"), p)).rejects.toThrow()
    expect(await readdir(path.dirname(p))).toEqual(["a.json"])
  })
})
