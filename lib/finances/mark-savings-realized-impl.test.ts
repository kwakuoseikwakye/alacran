import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import yaml from "yaml"
import { markSavingsRealizedImpl } from "./mark-savings-realized-impl"

describe("markSavingsRealizedImpl", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "alacran-realized-test-"))
    await fs.mkdir(path.join(tmpDir, "notes", "finances", "recommendations"), { recursive: true })
    await fs.mkdir(path.join(tmpDir, "records", "finances"), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("updates recommendation to realized and logs savings in runway.yaml", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-figma.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-1"
date: "2026-09-27"
title: "Downgrade Figma"
vendor: "Figma"
category: "Software"
action_type: "downgrade"
potential_savings_monthly: 45
status: "approved"
priority: "high"
---
### Finding
Inactive seats.`
    )

    const runwayFile = path.join(tmpDir, "records", "finances", "runway.yaml")
    await fs.writeFile(
      runwayFile,
      `schema_version: 1
cash_balance: 100000
monthly_burn: 10000
realized_savings_monthly: 0
records: []`
    )

    const gitCommitMock = async () => {}

    const result = await markSavingsRealizedImpl({
      companyRoot: tmpDir,
      fileName: "2026-09-27-figma.md",
      gitCommitFile: gitCommitMock,
    })

    expect(result.ok).toBe(true)

    // Check updated recommendation status
    const recContent = await fs.readFile(recFile, "utf-8")
    expect(recContent).toContain('status: "realized"')

    // Check updated runway record
    const runwayContent = await fs.readFile(runwayFile, "utf-8")
    const parsedRunway = yaml.parse(runwayContent)
    expect(parsedRunway.realized_savings_monthly).toBe(45)
    expect(parsedRunway.records.length).toBe(1)
    expect(parsedRunway.records[0].vendor).toBe("Figma")
    expect(parsedRunway.records[0].savings_monthly).toBe(45)
  })

  it("returns idempotent success without extra writes if already realized", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-figma.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-1"
vendor: "Figma"
status: "realized"
potential_savings_monthly: 45
---
Body`
    )

    const runwayFile = path.join(tmpDir, "records", "finances", "runway.yaml")
    await fs.writeFile(
      runwayFile,
      `schema_version: 1
records:
  - id: "rec-1"
    vendor: "Figma"
    savings_monthly: 45`
    )

    let commitCalled = false
    const result = await markSavingsRealizedImpl({
      companyRoot: tmpDir,
      fileName: "2026-09-27-figma.md",
      gitCommitFile: async () => {
        commitCalled = true
      },
    })

    expect(result.ok).toBe(true)
    expect(commitCalled).toBe(false)
  })

  it("rejects invalid or unsafe file names", async () => {
    const result = await markSavingsRealizedImpl({
      companyRoot: tmpDir,
      fileName: "../secrets.md",
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain("Invalid recommendation file name")
  })

  it("handles non-existent recommendation file gracefully", async () => {
    const result = await markSavingsRealizedImpl({
      companyRoot: tmpDir,
      fileName: "non-existent.md",
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain("Recommendation file not found")
  })

  it("supports explicit savingsMonthly override", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-saas.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-saas"
date: "2026-09-27"
title: "Renegotiate SaaS"
vendor: "Cloudflare"
action_type: "negotiate"
potential_savings_monthly: 100
status: "approved"
priority: "medium"
---
Body`
    )

    const runwayFile = path.join(tmpDir, "records", "finances", "runway.yaml")
    await fs.writeFile(
      runwayFile,
      `schema_version: 1
records: []`
    )

    const committedFiles: string[] = []
    const result = await markSavingsRealizedImpl({
      companyRoot: tmpDir,
      fileName: "2026-09-27-saas.md",
      savingsMonthly: 150,
      gitCommitFile: async (opts) => {
        committedFiles.push(...opts.filePaths)
      },
    })

    expect(result.ok).toBe(true)
    const runwayContent = await fs.readFile(runwayFile, "utf-8")
    const parsedRunway = yaml.parse(runwayContent)
    expect(parsedRunway.realized_savings_monthly).toBe(150)
    expect(parsedRunway.realized_savings_annual).toBe(1800)
    expect(parsedRunway.records[0].savings_monthly).toBe(150)
    expect(committedFiles).toHaveLength(2)
  })

  it("anchors status replacement strictly within YAML frontmatter and preserves body occurrences", async () => {
    const recFile = path.join(tmpDir, "notes", "finances", "recommendations", "2026-09-27-bodytest.md")
    await fs.writeFile(
      recFile,
      `---
id: "rec-bodytest"
vendor: "PostHog"
action_type: "downgrade"
potential_savings_monthly: 80
status: "approved"
priority: "high"
---
### Finding
The status: pending in this description should never be changed.`
    )

    const result = await markSavingsRealizedImpl({
      companyRoot: tmpDir,
      fileName: "2026-09-27-bodytest.md",
    })

    expect(result.ok).toBe(true)
    const recContent = await fs.readFile(recFile, "utf-8")
    expect(recContent).toContain('status: "realized"')
    expect(recContent).toContain("The status: pending in this description should never be changed.")
  })
})
