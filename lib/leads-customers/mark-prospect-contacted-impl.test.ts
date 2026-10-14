import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parse } from "yaml"
import type { ExecFileFn } from "../git-commit-file"
import { markProspectContactedImpl } from "./mark-prospect-contacted-impl"

describe("markProspectContactedImpl", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "leads-mark-test-"))
    await mkdir(path.join(tmpDir, "notes/funnel/prospects"), { recursive: true })
    await mkdir(path.join(tmpDir, "records/funnel"), { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("updates prospect status to contacted and appends qualified lead to records/funnel/leads.yaml", async () => {
    const fileName = "2026-09-27-acme.md"
    const prospectContent = `---
id: lead-20260927-acme
type: prospect
status: approved
name: Alice Smith
role: Founder
company: Acme Tech
value: 8000
---

## Suggested Outreach Angle
Hello Alice`
    await writeFile(path.join(tmpDir, "notes/funnel/prospects", fileName), prospectContent, "utf-8")

    const runRecordPath = path.join(tmpDir, "run.json")
    await writeFile(runRecordPath, JSON.stringify({ before: [fileName] }), "utf-8")

    const mockExec: ExecFileFn = async () => ({ stdout: "", stderr: "" })

    const res = await markProspectContactedImpl(tmpDir, fileName, "2026-09-27", runRecordPath, mockExec)
    expect(res.ok).toBe(true)

    // Check updated markdown
    const updatedMd = await readFile(path.join(tmpDir, "notes/funnel/prospects", fileName), "utf-8")
    expect(updatedMd).toContain("status: contacted")
    expect(updatedMd).toContain("contacted_on: 2026-09-27")

    // Check leads.yaml
    const leadsRaw = await readFile(path.join(tmpDir, "records/funnel/leads.yaml"), "utf-8")
    const leads = parse(leadsRaw)
    expect(leads.records).toHaveLength(1)
    expect(leads.records[0].name).toBe("Acme Tech")
    expect(leads.records[0].stage).toBe("qualified")
  })

  it("rejects invalid prospect file names", async () => {
    const res = await markProspectContactedImpl(tmpDir, "../bad.md", "2026-09-27", path.join(tmpDir, "run.json"))
    expect(res.ok).toBe(false)
    expect(res.message).toBe("Invalid prospect file name.")
  })

  it("rejects marking when prospect is not yet approved in run record", async () => {
    const fileName = "2026-09-27-pending.md"
    const prospectContent = `---
name: Bob Jones
company: Beta Corp
---

## Suggested Outreach Angle
Hi Bob`
    await writeFile(path.join(tmpDir, "notes/funnel/prospects", fileName), prospectContent, "utf-8")

    const runRecordPath = path.join(tmpDir, "run.json")
    await writeFile(runRecordPath, JSON.stringify({ before: ["other.md"] }), "utf-8")

    const res = await markProspectContactedImpl(tmpDir, fileName, "2026-09-27", runRecordPath)
    expect(res.ok).toBe(false)
    expect(res.message).toBe("Approve this prospect before marking them as contacted.")
  })

  it("updates existing lead in leads.yaml instead of creating duplicate", async () => {
    const fileName = "2026-09-27-acme.md"
    const prospectContent = `---
id: lead-20260927-acme
type: prospect
status: approved
name: Alice Smith
role: Founder
company: Acme Tech
value: 8000
---

## Suggested Outreach Angle
Hello Alice`
    await writeFile(path.join(tmpDir, "notes/funnel/prospects", fileName), prospectContent, "utf-8")

    const existingLeads = {
      schema_version: 1,
      records: [
        {
          id: "lead-20260927-acme",
          name: "Acme Tech",
          stage: "new",
          source: "prospect-research",
          owner: "human",
          value: 8000,
          currency: "USD",
          first_seen: "2026-09-20",
          last_touch: "2026-09-20",
        },
      ],
    }
    await writeFile(path.join(tmpDir, "records/funnel/leads.yaml"), JSON.stringify(existingLeads), "utf-8")

    const runRecordPath = path.join(tmpDir, "run.json")
    await writeFile(runRecordPath, JSON.stringify({ before: [fileName] }), "utf-8")

    const mockExec: ExecFileFn = async () => ({ stdout: "", stderr: "" })

    const res = await markProspectContactedImpl(tmpDir, fileName, "2026-09-27", runRecordPath, mockExec)
    expect(res.ok).toBe(true)

    const leadsRaw = await readFile(path.join(tmpDir, "records/funnel/leads.yaml"), "utf-8")
    const leads = parse(leadsRaw)
    expect(leads.records).toHaveLength(1)
    expect(leads.records[0].stage).toBe("qualified")
    expect(leads.records[0].last_touch).toBe("2026-09-27")
  })

  it("returns idempotent success without making git commits if prospect already contacted and lead qualified", async () => {
    const fileName = "2026-09-27-acme.md"
    const prospectContent = `---
id: lead-20260927-acme
type: prospect
status: contacted
contacted_on: 2026-09-27
name: Alice Smith
role: Founder
company: Acme Tech
value: 8000
---

## Suggested Outreach Angle
Hello Alice`
    await writeFile(path.join(tmpDir, "notes/funnel/prospects", fileName), prospectContent, "utf-8")

    const existingLeads = {
      schema_version: 1,
      records: [
        {
          id: "lead-20260927-acme",
          name: "Acme Tech",
          stage: "qualified",
          source: "prospect-research",
          owner: "human",
          value: 8000,
          currency: "USD",
          first_seen: "2026-09-20",
          last_touch: "2026-09-27",
        },
      ],
    }
    await writeFile(path.join(tmpDir, "records/funnel/leads.yaml"), JSON.stringify(existingLeads), "utf-8")

    const runRecordPath = path.join(tmpDir, "run.json")
    const mockExec = vi.fn<ExecFileFn>()

    const res = await markProspectContactedImpl(tmpDir, fileName, "2026-09-27", runRecordPath, mockExec)
    expect(res.ok).toBe(true)
    expect(res.message).toBe("Already marked Acme Tech as contacted.")
    expect(mockExec).not.toHaveBeenCalled()
  })
})

