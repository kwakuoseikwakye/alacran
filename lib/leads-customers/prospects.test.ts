import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { isSafeProspectFileName, parseProspect, listProspects, PROSPECTS_DIR } from "./prospects"

describe("isSafeProspectFileName", () => {
  it("accepts safe markdown filenames", () => {
    expect(isSafeProspectFileName("2026-09-27-acme-corp.md")).toBe(true)
    expect(isSafeProspectFileName("lead-123.md")).toBe(true)
  })

  it("rejects path traversal and non-markdown names", () => {
    expect(isSafeProspectFileName("../secret.md")).toBe(false)
    expect(isSafeProspectFileName("prospect.txt")).toBe(false)
    expect(isSafeProspectFileName("/root.md")).toBe(false)
  })
})

describe("parseProspect", () => {
  const sampleMarkdown = `---
id: lead-20260927-acme
type: prospect
status: draft
name: Jane Doe
role: VP of Engineering
company: Acme Corp
url: https://acme.example.com
fit_score: 92
fit_level: high
estimated_value: 12000
created: 2026-09-27
updated: 2026-09-27
---

## ICP Fit Rationale
Acme Corp operates a high-volume data pipeline that aligns with our core performance capabilities.

## Company Background & Pain Points
Recently announced hiring for 10 DevOps engineers; struggling with latency on daily batch syncs.

## Suggested Outreach Angle
Hi Jane, noticed Acme's recent expansion in data infra. We help teams cut batch sync delays by 40% without cloud vendor lock-in.`

  it("parses valid frontmatter and markdown sections", () => {
    const prospect = parseProspect("2026-09-27-acme.md", sampleMarkdown, "waiting")
    expect(prospect.fileName).toBe("2026-09-27-acme.md")
    expect(prospect.name).toBe("Jane Doe")
    expect(prospect.role).toBe("VP of Engineering")
    expect(prospect.company).toBe("Acme Corp")
    expect(prospect.url).toBe("https://acme.example.com")
    expect(prospect.fitScore).toBe(92)
    expect(prospect.fitLevel).toBe("high")
    expect(prospect.estimatedValue).toBe(12000)
    expect(prospect.rationale).toContain("Acme Corp operates a high-volume data pipeline")
    expect(prospect.painPoints).toContain("struggling with latency")
    expect(prospect.pitch).toContain("Hi Jane, noticed Acme's recent expansion")
    expect(prospect.problems).toEqual([])
  })

  it("handles missing body sections gracefully", () => {
    const broken = `---
name: John
company: Beta LLC
---`
    const prospect = parseProspect("2026-09-27-beta.md", broken, "ready")
    expect(prospect.company).toBe("Beta LLC")
    expect(prospect.problems).toContain("This prospect is missing outreach details.")
  })

  it("computes fitLevel from fitScore when fit_level is omitted", () => {
    const high = parseProspect("high.md", "---\nfit_score: 88\n---\n## ICP Fit Rationale\nYes", "ready")
    expect(high.fitLevel).toBe("high")

    const medium = parseProspect("med.md", "---\nfit_score: 70\n---\n## ICP Fit Rationale\nYes", "ready")
    expect(medium.fitLevel).toBe("medium")

    const low = parseProspect("low.md", "---\nfit_score: 40\n---\n## ICP Fit Rationale\nYes", "ready")
    expect(low.fitLevel).toBe("low")
  })
})

describe("listProspects", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "leads-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("returns empty array if directory does not exist", async () => {
    const results = await listProspects(tmpDir, path.join(tmpDir, "missing-run.json"))
    expect(results).toEqual([])
  })

  it("lists prospects and distinguishes waiting vs ready based on run record", async () => {
    const prospectsDir = path.join(tmpDir, PROSPECTS_DIR)
    await mkdir(prospectsDir, { recursive: true })

    const file1 = path.join(prospectsDir, "existing.md")
    const file2 = path.join(prospectsDir, "new-lead.md")
    const file3 = path.join(prospectsDir, "contacted.md")

    await writeFile(file1, "---\nname: Existing Lead\n---\n## ICP Fit Rationale\nFit", "utf-8")
    await writeFile(file2, "---\nname: New Lead\n---\n## ICP Fit Rationale\nFit", "utf-8")
    await writeFile(file3, "---\nname: Contacted Lead\nstatus: contacted\n---\n## ICP Fit Rationale\nFit", "utf-8")

    const runRecordPath = path.join(tmpDir, "run-record.json")
    // 'existing.md' and 'contacted.md' were in 'before', but 'new-lead.md' was generated during run
    await writeFile(runRecordPath, JSON.stringify({ before: ["existing.md", "contacted.md"] }), "utf-8")

    const results = await listProspects(tmpDir, runRecordPath)
    expect(results.map((p) => p.fileName)).toEqual(["contacted.md", "existing.md", "new-lead.md"])

    const contacted = results.find((p) => p.fileName === "contacted.md")
    expect(contacted?.state).toBe("contacted")

    const existing = results.find((p) => p.fileName === "existing.md")
    expect(existing?.state).toBe("ready")

    const newLead = results.find((p) => p.fileName === "new-lead.md")
    expect(newLead?.state).toBe("waiting")
  })
})
