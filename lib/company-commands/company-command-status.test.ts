import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-command-status-test-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("getCompanyCommandStatus", () => {
  it("reports not running for an unknown agentId, without touching the filesystem", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { getCompanyCommandStatus } = await import("./company-command-status")

    const result = await getCompanyCommandStatus("no-such-agent")

    expect(result).toEqual({ running: false })
  })

  it("reports not running for a known agent with no lock file", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" }],
    }))
    const { getCompanyCommandStatus } = await import("./company-command-status")

    const result = await getCompanyCommandStatus("ai-company-starter-main")

    expect(result).toEqual({ running: false })
  })

  it("reports running when that agent's own lock is held, without being affected by another agent's lock state", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [
        { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" },
        { id: "second-co", name: "Second Co", rootPath: "/irrelevant-2", kind: "command-set" },
      ],
    }))
    const { acquireRunLock } = await import("./run-lock")
    await acquireRunLock(path.join(dataDir, "second-co"))
    const { getCompanyCommandStatus } = await import("./company-command-status")

    const secondCoStatus = await getCompanyCommandStatus("second-co")
    const aiCompanyStatus = await getCompanyCommandStatus("ai-company-starter-main")

    expect(secondCoStatus).toEqual({ running: true })
    expect(aiCompanyStatus).toEqual({ running: false })
  })
})
