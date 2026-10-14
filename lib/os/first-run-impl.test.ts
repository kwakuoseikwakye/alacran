import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let root: string
let dataRoot: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "first-run-impl-root-"))
  dataRoot = await mkdtemp(path.join(tmpdir(), "first-run-impl-data-"))
  vi.doMock("../config", () => ({
    AGENTS: [{ id: "test-co", name: "Test Co", rootPath: root, kind: "command-set" }],
  }))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataRoot, { recursive: true, force: true })
  vi.resetModules()
})

describe("dismissFirstRunGuideImpl", () => {
  it("records a dismissal for a known company", async () => {
    const { dismissFirstRunGuideImpl } = await import("./first-run-impl")
    expect(await dismissFirstRunGuideImpl("test-co", dataRoot)).toEqual({ ok: true })
    const saved = JSON.parse(await readFile(path.join(dataRoot, "test-co", "first-run.json"), "utf-8"))
    expect(typeof saved.dismissedAt).toBe("string")
  })

  it("refuses an unknown company and writes nothing", async () => {
    const { dismissFirstRunGuideImpl } = await import("./first-run-impl")
    expect(await dismissFirstRunGuideImpl("nobody", dataRoot)).toEqual({ ok: false })
    expect(await readdir(dataRoot)).toEqual([])
  })

  it("refuses a path-like id and writes nothing, in or outside the data root", async () => {
    const { dismissFirstRunGuideImpl } = await import("./first-run-impl")
    expect(await dismissFirstRunGuideImpl("../../escape", dataRoot)).toEqual({ ok: false })
    expect(await readdir(dataRoot)).toEqual([])
  })
})
