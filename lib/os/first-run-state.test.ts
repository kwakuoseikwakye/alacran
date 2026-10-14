import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { readFirstRun, markFirstSaved, dismissFirstRun } from "./first-run-state"

let dir: string
const file = () => path.join(dir, "first-run.json")
const at = (iso: string) => () => new Date(iso)

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "first-run-state-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("first-run state", () => {
  it("reads as empty when there is no file", async () => {
    expect(await readFirstRun(dir)).toEqual({})
  })

  it("records the first approval once and keeps the first time", async () => {
    await markFirstSaved(dir, at("2026-09-29T10:15:00.000Z"))
    await markFirstSaved(dir, at("2026-09-29T11:00:00.000Z"))
    expect(await readFirstRun(dir)).toEqual({ firstSavedAt: "2026-09-29T10:15:00.000Z" })
    expect(JSON.parse(await readFile(file(), "utf-8"))).toEqual({ firstSavedAt: "2026-09-29T10:15:00.000Z" })
  })

  it("records a dismissal without losing the first approval", async () => {
    await markFirstSaved(dir, at("2026-09-29T10:15:00.000Z"))
    await dismissFirstRun(dir, at("2026-09-29T10:20:00.000Z"))
    expect(await readFirstRun(dir)).toEqual({
      firstSavedAt: "2026-09-29T10:15:00.000Z",
      dismissedAt: "2026-09-29T10:20:00.000Z",
    })
  })

  it("creates the directory when it does not exist yet", async () => {
    const nested = path.join(dir, "company-runs", "acme")
    await dismissFirstRun(nested, at("2026-09-29T10:20:00.000Z"))
    expect(await readFirstRun(nested)).toEqual({ dismissedAt: "2026-09-29T10:20:00.000Z" })
  })

  it("treats a corrupt file as no marker instead of throwing", async () => {
    await writeFile(file(), "{ this is not json", "utf-8")
    expect(await readFirstRun(dir)).toEqual({})
    await expect(markFirstSaved(dir, at("2026-09-29T10:15:00.000Z"))).resolves.toBeUndefined()
    expect(await readFirstRun(dir)).toEqual({ firstSavedAt: "2026-09-29T10:15:00.000Z" })
  })

  it("ignores fields that are not strings, and JSON that is not an object", async () => {
    await writeFile(file(), JSON.stringify({ firstSavedAt: 12345, dismissedAt: { at: "x" } }), "utf-8")
    expect(await readFirstRun(dir)).toEqual({})
    await writeFile(file(), "null", "utf-8")
    expect(await readFirstRun(dir)).toEqual({})
    await writeFile(file(), "[1,2]", "utf-8")
    expect(await readFirstRun(dir)).toEqual({})
  })
})
