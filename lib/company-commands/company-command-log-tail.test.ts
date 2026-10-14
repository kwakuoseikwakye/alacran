import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-command-log-tail-test-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("getCompanyCommandLogTail", () => {
  it("rejects an unknown commandId without touching the filesystem", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" }],
    }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("create-epic", "ai-company-starter-main")

    expect(result).toEqual({ tail: "" })
  })

  it("returns empty tail for an unknown agentId", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest", "no-such-agent")

    expect(result).toEqual({ tail: "" })
  })

  it("returns empty tail when the log file doesn't exist yet", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" }],
    }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest", "ai-company-starter-main")

    expect(result).toEqual({ tail: "" })
  })

  it("returns the log's tail for a known command, scoped to the given agent's own subdirectory", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" }],
    }))
    await mkdir(path.join(dataDir, "ai-company-starter-main"), { recursive: true })
    await writeFile(path.join(dataDir, "ai-company-starter-main", "digest.log"), "scanning notes/...\nwrote digest\n")
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest", "ai-company-starter-main")

    expect(result).toEqual({ tail: "scanning notes/...\nwrote digest" })
  })

  it("keeps a second agent's log completely isolated", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [
        { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/irrelevant", kind: "command-set" },
        { id: "second-co", name: "Second Co", rootPath: "/irrelevant-2", kind: "command-set" },
      ],
    }))
    await mkdir(path.join(dataDir, "ai-company-starter-main"), { recursive: true })
    await writeFile(path.join(dataDir, "ai-company-starter-main", "digest.log"), "company A's log\n")
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest", "second-co")

    expect(result).toEqual({ tail: "" })
  })
})
