import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"

let dataDir: string
let agentRoot: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "company-result-data-"))
  agentRoot = await mkdtemp(path.join(tmpdir(), "company-result-agent-"))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  await rm(agentRoot, { recursive: true, force: true })
})

describe("getCompanyCommandResultImpl", () => {
  it("reports no run recorded when the run.json file doesn't exist", async () => {
    const result = await getCompanyCommandResultImpl("digest", dataDir, agentRoot)
    expect(result).toEqual({ changed: false, message: "No run recorded for this command yet." })
  })

  it("detects a new file in a new-file-in-dir command's output directory", async () => {
    await mkdir(path.join(agentRoot, "notes/company/digests"), { recursive: true })
    await writeFile(
      path.join(dataDir, "digest.run.json"),
      JSON.stringify({ commandId: "digest", outputKind: "new-file-in-dir", outputPath: "notes/company/digests", before: [] })
    )
    await writeFile(path.join(agentRoot, "notes/company/digests/2026-07-23-digest.md"), "# Digest\ncontent")

    const result = await getCompanyCommandResultImpl("digest", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: path.join("notes/company/digests", "2026-07-23-digest.md"),
      oldText: "",
      newText: "# Digest\ncontent",
      extraFiles: [],
    })
  })

  it("reports no changes when no new file appears in the output directory", async () => {
    await mkdir(path.join(agentRoot, "docs/retros"), { recursive: true })
    await writeFile(path.join(agentRoot, "docs/retros/2026-07-01-retro.md"), "old")
    await writeFile(
      path.join(dataDir, "retro.run.json"),
      JSON.stringify({ commandId: "retro", outputKind: "new-file-in-dir", outputPath: "docs/retros", before: ["2026-07-01-retro.md"] })
    )

    const result = await getCompanyCommandResultImpl("retro", dataDir, agentRoot)

    expect(result).toEqual({ changed: false, message: "No changes produced." })
  })

  it("lists extra files beyond the primary one, sorted, if more than one new file appears", async () => {
    await mkdir(path.join(agentRoot, "docs/decisions"), { recursive: true })
    await writeFile(
      path.join(dataDir, "decision.run.json"),
      JSON.stringify({ commandId: "decision", outputKind: "new-file-in-dir", outputPath: "docs/decisions", before: [] })
    )
    await writeFile(path.join(agentRoot, "docs/decisions/b-second.md"), "second")
    await writeFile(path.join(agentRoot, "docs/decisions/a-first.md"), "first")

    const result = await getCompanyCommandResultImpl("decision", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: path.join("docs/decisions", "a-first.md"),
      oldText: "",
      newText: "first",
      extraFiles: ["b-second.md"],
    })
  })

  it("detects a content change for a known-file command", async () => {
    await mkdir(path.join(agentRoot, "definitions/ontology"), { recursive: true })
    await writeFile(path.join(agentRoot, "definitions/ontology/company.yaml"), "version: 1\nstatus: draft\n")
    await writeFile(
      path.join(dataDir, "define-company.run.json"),
      JSON.stringify({
        commandId: "define-company",
        outputKind: "known-file",
        outputPath: "definitions/ontology/company.yaml",
        before: null,
      })
    )

    const result = await getCompanyCommandResultImpl("define-company", dataDir, agentRoot)

    expect(result).toEqual({
      changed: true,
      outputPath: "definitions/ontology/company.yaml",
      oldText: "",
      newText: "version: 1\nstatus: draft\n",
      extraFiles: [],
    })
  })

  it("reports no changes for a known-file command whose content is unchanged", async () => {
    await writeFile(path.join(agentRoot, "HANDOFF.md"), "# HANDOFF\nsame content\n")
    await writeFile(
      path.join(dataDir, "handoff.run.json"),
      JSON.stringify({ commandId: "handoff", outputKind: "known-file", outputPath: "HANDOFF.md", before: "# HANDOFF\nsame content\n" })
    )

    const result = await getCompanyCommandResultImpl("handoff", dataDir, agentRoot)

    expect(result).toEqual({ changed: false, message: "No changes produced." })
  })
})
