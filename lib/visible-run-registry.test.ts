import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string
let registryPath: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "visible-run-registry-data-"))
  registryPath = path.join(dataDir, "visible-runs.json")
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [
      { id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: "/fake", kind: "pipeline" },
      { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/fake", kind: "command-set" },
    ],
  }))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("visible-run-registry", () => {
  it("returns an empty list when the registry file doesn't exist", async () => {
    const { getVisibleRunAssignments } = await import("./visible-run-registry")
    expect(await getVisibleRunAssignments(registryPath)).toEqual([])
  })

  it("returns an empty list when the registry file is unparseable", async () => {
    await writeFile(registryPath, "{ not json")
    const { getVisibleRunAssignments } = await import("./visible-run-registry")
    expect(await getVisibleRunAssignments(registryPath)).toEqual([])
  })

  it("defaults an unassigned agent to false", async () => {
    const { getVisibleRunForAgent } = await import("./visible-run-registry")
    expect(await getVisibleRunForAgent("ai-company-starter-main", registryPath)).toBe(false)
  })

  it("sets a new assignment for a known agent", async () => {
    const { setVisibleRunImpl, getVisibleRunAssignments } = await import("./visible-run-registry")
    const result = await setVisibleRunImpl("ai-company-starter-main", true, registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getVisibleRunAssignments(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", runVisibly: true },
    ])
  })

  it("upserts — setting a second time for the same agent replaces the first", async () => {
    const { setVisibleRunImpl, getVisibleRunAssignments } = await import("./visible-run-registry")
    await setVisibleRunImpl("ai-company-starter-main", true, registryPath)
    await setVisibleRunImpl("ai-company-starter-main", false, registryPath)
    expect(await getVisibleRunAssignments(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", runVisibly: false },
    ])
  })

  it("getVisibleRunForAgent reflects an assignment once set", async () => {
    const { setVisibleRunImpl, getVisibleRunForAgent } = await import("./visible-run-registry")
    await setVisibleRunImpl("ai-company-starter-main", true, registryPath)
    expect(await getVisibleRunForAgent("ai-company-starter-main", registryPath)).toBe(true)
  })

  it("rejects an unknown agentId", async () => {
    const { setVisibleRunImpl } = await import("./visible-run-registry")
    const result = await setVisibleRunImpl("not-a-real-agent", true, registryPath)
    expect(result).toEqual({ ok: false, message: "Unknown agent" })
  })
})
