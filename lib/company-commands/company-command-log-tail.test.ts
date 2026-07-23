import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
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
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("create-epic")

    expect(result).toEqual({ tail: "" })
  })

  it("returns empty tail when the log file doesn't exist yet", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest")

    expect(result).toEqual({ tail: "" })
  })

  it("returns the log's tail for a known command", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    await writeFile(path.join(dataDir, "digest.log"), "scanning notes/...\nwrote digest\n")
    const { getCompanyCommandLogTail } = await import("./company-command-log-tail")

    const result = await getCompanyCommandLogTail("digest")

    expect(result).toEqual({ tail: "scanning notes/...\nwrote digest" })
  })
})
