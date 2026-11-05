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
  // Absence means OFF: unattended spend is opt-IN.
  it("is OFF for a company with no entry", async () => {
    expect(await getSessionNotesForAgent("co", registry())).toBe(false)
  })

  it("is OFF when the registry file does not exist at all", async () => {
    expect(await getSessionNotesForAgent("co", path.join(dir, "nope.json"))).toBe(false)
  })

  it("is ON once a company has opted in", async () => {
    await writeFile(registry(), JSON.stringify([{ agentId: "co", autoWrite: true }]))
    expect(await getSessionNotesForAgent("co", registry())).toBe(true)
  })

  it("keeps an explicit OFF", async () => {
    await writeFile(registry(), JSON.stringify([{ agentId: "co", autoWrite: false }]))
    expect(await getSessionNotesForAgent("co", registry())).toBe(false)
  })

  it("does not let one company's setting decide another's", async () => {
    await writeFile(registry(), JSON.stringify([{ agentId: "co", autoWrite: true }]))
    expect(await getSessionNotesForAgent("other", registry())).toBe(false)
  })

  it("falls back to OFF rather than throwing on a corrupt file", async () => {
    await writeFile(registry(), "{not json")
    expect(await getSessionNotesForAgent("co", registry())).toBe(false)
    expect(await getSessionNotesAssignments(registry())).toEqual([])
  })
})
