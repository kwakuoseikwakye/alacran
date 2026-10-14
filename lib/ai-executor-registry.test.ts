import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string
let registryPath: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "ai-executor-registry-data-"))
  registryPath = path.join(dataDir, "ai-executors.json")
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("ai-executor-registry", () => {
  it("returns an empty list when the registry file doesn't exist", async () => {
    const { getAiExecutorAssignments } = await import("./ai-executor-registry")
    expect(await getAiExecutorAssignments(registryPath)).toEqual([])
  })

  it("returns an empty list when the registry file is unparseable", async () => {
    await writeFile(registryPath, "{ not json")
    const { getAiExecutorAssignments } = await import("./ai-executor-registry")
    expect(await getAiExecutorAssignments(registryPath)).toEqual([])
  })

  it("defaults an unassigned agent to claude-code", async () => {
    const { getAiExecutorIdForAgent } = await import("./ai-executor-registry")
    expect(await getAiExecutorIdForAgent("ai-company-starter-main", registryPath)).toBe("claude-code")
  })

  // What a pre-v99 install really has on disk: a hand-written registry file,
  // no writer left in the app. Reads have to keep working against it.
  it("reads an assignment written before the picker was removed", async () => {
    await writeFile(
      registryPath,
      JSON.stringify([{ agentId: "ai-company-starter-main", executorId: "claude-code" }])
    )
    const { getAiExecutorIdForAgent, getAiExecutorAssignments } = await import("./ai-executor-registry")
    expect(await getAiExecutorAssignments(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", executorId: "claude-code" },
    ])
    expect(await getAiExecutorIdForAgent("ai-company-starter-main", registryPath)).toBe("claude-code")
  })

  // The whole reason v99 could delete three executors without a migration: a
  // company still assigned to one lands on the default instead of breaking.
  it("falls back to the default for an assignment naming a retired executor", async () => {
    await writeFile(registryPath, JSON.stringify([{ agentId: "ai-company-starter-main", executorId: "aider" }]))
    const { getAiExecutorIdForAgent, resolveAiExecutorForAgent } = await import("./ai-executor-registry")
    expect(await getAiExecutorIdForAgent("ai-company-starter-main", registryPath)).toBe("claude-code")
    expect((await resolveAiExecutorForAgent("ai-company-starter-main", registryPath)).binaryName).toBe("claude")
  })

  it("resolveAiExecutorForAgent defaults to claude-code for an unassigned agent", async () => {
    const { resolveAiExecutorForAgent } = await import("./ai-executor-registry")
    const executor = await resolveAiExecutorForAgent("ai-company-starter-main", registryPath)
    expect(executor.id).toBe("claude-code")
  })

})
