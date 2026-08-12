import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string
let registryPath: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "ai-executor-registry-data-"))
  registryPath = path.join(dataDir, "ai-executors.json")
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [
      { id: "legacy-pipeline", name: "Legacy Pipeline", rootPath: "/fake", kind: "pipeline" },
      { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/fake", kind: "command-set" },
    ],
  }))
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

  it("sets a new assignment for a known agent", async () => {
    const { setAiExecutorImpl, getAiExecutorAssignments } = await import("./ai-executor-registry")
    const result = await setAiExecutorImpl("ai-company-starter-main", "aider", registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getAiExecutorAssignments(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", executorId: "aider" },
    ])
  })

  it("upserts — setting a second time for the same agent replaces the first", async () => {
    const { setAiExecutorImpl, getAiExecutorAssignments } = await import("./ai-executor-registry")
    await setAiExecutorImpl("ai-company-starter-main", "aider", registryPath)
    await setAiExecutorImpl("ai-company-starter-main", "openai-codex", registryPath)
    expect(await getAiExecutorAssignments(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", executorId: "openai-codex" },
    ])
  })

  it("getAiExecutorIdForAgent reflects an assignment once set", async () => {
    const { setAiExecutorImpl, getAiExecutorIdForAgent } = await import("./ai-executor-registry")
    await setAiExecutorImpl("ai-company-starter-main", "aider", registryPath)
    expect(await getAiExecutorIdForAgent("ai-company-starter-main", registryPath)).toBe("aider")
  })

  it("resolveAiExecutorForAgent returns the full executor object for an assignment", async () => {
    const { setAiExecutorImpl, resolveAiExecutorForAgent } = await import("./ai-executor-registry")
    await setAiExecutorImpl("ai-company-starter-main", "openai-codex", registryPath)
    const executor = await resolveAiExecutorForAgent("ai-company-starter-main", registryPath)
    expect(executor.id).toBe("openai-codex")
    expect(executor.binaryName).toBe("codex")
  })

  it("resolveAiExecutorForAgent defaults to claude-code for an unassigned agent", async () => {
    const { resolveAiExecutorForAgent } = await import("./ai-executor-registry")
    const executor = await resolveAiExecutorForAgent("ai-company-starter-main", registryPath)
    expect(executor.id).toBe("claude-code")
  })

  it("rejects an unknown agentId", async () => {
    const { setAiExecutorImpl } = await import("./ai-executor-registry")
    const result = await setAiExecutorImpl("not-a-real-agent", "aider", registryPath)
    expect(result).toEqual({ ok: false, message: "Unknown agent" })
  })

  it("rejects an unknown executorId", async () => {
    const { setAiExecutorImpl } = await import("./ai-executor-registry")
    const result = await setAiExecutorImpl("ai-company-starter-main", "not-a-real-executor", registryPath)
    expect(result).toEqual({ ok: false, message: "Unknown AI executor" })
  })
})
