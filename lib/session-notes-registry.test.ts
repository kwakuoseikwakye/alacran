import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { getSessionNotesForAgent, getSessionNotesAssignments } from "./session-notes-registry"

let dir: string
const registry = () => path.join(dir, "session-notes.json")

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "alacran-sn-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("getSessionNotesForAgent", () => {
  // The one place this differs from visible-runs, so it is the one pinned
  // hardest: the file records the opt-OUT, so absence means on.
  it("is ON for a company with no entry", async () => {
    expect(await getSessionNotesForAgent("co", registry())).toBe(true)
  })

  it("is ON when the registry file does not exist at all", async () => {
    expect(await getSessionNotesForAgent("co", path.join(dir, "nope.json"))).toBe(true)
  })

  it("is OFF once a company has opted out", async () => {
    await writeFile(registry(), JSON.stringify([{ agentId: "co", autoWrite: false }]))
    expect(await getSessionNotesForAgent("co", registry())).toBe(false)
  })

  it("does not let one company's setting decide another's", async () => {
    await writeFile(registry(), JSON.stringify([{ agentId: "co", autoWrite: false }]))
    expect(await getSessionNotesForAgent("other", registry())).toBe(true)
  })

  it("falls back to ON rather than throwing on a corrupt file", async () => {
    await writeFile(registry(), "{not json")
    expect(await getSessionNotesForAgent("co", registry())).toBe(true)
    expect(await getSessionNotesAssignments(registry())).toEqual([])
  })
})
