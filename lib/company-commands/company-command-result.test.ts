import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string
let agentRoot: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-command-result-data-"))
  agentRoot = await mkdtemp(path.join(tmpdir(), "company-command-result-agent-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  await rm(agentRoot, { recursive: true, force: true })
  vi.resetModules()
})

describe("getCompanyCommandResult", () => {
  it("reports an error for an unknown agentId", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({ AGENTS: [] }))
    const { getCompanyCommandResult } = await import("./company-command-result")

    const result = await getCompanyCommandResult("digest", "no-such-agent")

    expect(result).toEqual({ changed: false, message: 'Unknown company "no-such-agent"' })
  })

  it("reads the given agent's own run record and repo content", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: agentRoot, kind: "command-set" }],
    }))
    await mkdir(path.join(agentRoot, "notes/company/digests"), { recursive: true })
    await mkdir(path.join(dataDir, "ai-company-starter-main"), { recursive: true })
    await writeFile(
      path.join(dataDir, "ai-company-starter-main", "digest.run.json"),
      JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
    )
    await writeFile(path.join(agentRoot, "notes/company/digests/2026-07-23-digest.md"), "# Digest\ncontent")
    const { getCompanyCommandResult } = await import("./company-command-result")

    const result = await getCompanyCommandResult("digest", "ai-company-starter-main")

    expect(result).toEqual({
      changed: true,
      outputPath: path.join("notes/company/digests", "2026-07-23-digest.md"),
      oldText: "",
      newText: "# Digest\ncontent",
      extraFiles: [],
    })
  })

  it("keeps a second agent's result completely isolated from the first's run record", async () => {
    vi.doMock("./paths", () => ({ COMPANY_COMMANDS_DATA_DIR: dataDir }))
    vi.doMock("../config", () => ({
      AGENTS: [
        { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: agentRoot, kind: "command-set" },
        { id: "second-co", name: "Second Co", rootPath: agentRoot, kind: "command-set" },
      ],
    }))
    await mkdir(path.join(dataDir, "ai-company-starter-main"), { recursive: true })
    await writeFile(
      path.join(dataDir, "ai-company-starter-main", "digest.run.json"),
      JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
    )
    const { getCompanyCommandResult } = await import("./company-command-result")

    const result = await getCompanyCommandResult("digest", "second-co")

    expect(result).toEqual({ changed: false, message: "No run recorded for this command yet." })
  })
})
