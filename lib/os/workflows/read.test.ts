import { describe, it, expect, vi, beforeEach } from "vitest"
import { clearFileMemo } from "../file-memo"
import { readWorkflows } from "./read"

describe("readWorkflows", () => {
  beforeEach(() => {
    clearFileMemo()
  })

  it("returns empty records when workflows file does not exist (ENOENT)", async () => {
    const statFn = vi.fn().mockRejectedValue(new Error("ENOENT"))
    const readFn = vi.fn()

    const result = await readWorkflows("/mock/company", readFn, statFn)
    expect(result.ok).toBe(true)
    expect(result.records).toEqual([])
  })

  it("returns empty records when yaml content is empty", async () => {
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readFn = vi.fn().mockResolvedValue("")

    const result = await readWorkflows("/mock/company", readFn, statFn)
    expect(result.ok).toBe(true)
    expect(result.records).toEqual([])
  })

  it("parses valid processes.yaml file", async () => {
    const yamlContent = `
schema_version: 1
records:
  - id: wf-onboarding
    name: Customer Onboarding
    department: Operations
    description: Client setup and onboarding flow
    steps:
      - id: step-invite
        title: Send Workspace Invite
        owner: ops-lead
        owner_kind: human
        hours_per_week: 2.5
        tools:
          - slack
          - email
        gate_checkpoint: credentials
        automation:
          title: Auto-invite webhook
          state: live
          recovered_usd: 500
`
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readFn = vi.fn().mockResolvedValue(yamlContent)

    const result = await readWorkflows("/mock/company", readFn, statFn)
    expect(result.ok).toBe(true)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].id).toBe("wf-onboarding")
    expect(result.records[0].steps).toHaveLength(1)
    expect(result.records[0].steps[0].gate_checkpoint).toBe("credentials")
    expect(result.records[0].steps[0].automation?.state).toBe("live")
  })

  it("fails loud when file has invalid schema", async () => {
    const yamlContent = `
schema_version: 1
records:
  - id: wf-broken
    name: Broken Workflow
    department: Engineering
    description: Invalid step data
    steps:
      - id: step-bad
        title: Bad Step
        owner: engineer
        owner_kind: robot_overlord
        hours_per_week: -10
`
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readFn = vi.fn().mockResolvedValue(yamlContent)

    const result = await readWorkflows("/mock/company", readFn, statFn)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("processes.yaml")
    }
  })

  it("fails loud when yaml is malformed", async () => {
    const malformedYaml = `
schema_version: 1
records: [
  unclosed array
`
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readFn = vi.fn().mockResolvedValue(malformedYaml)

    const result = await readWorkflows("/mock/company", readFn, statFn)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Failed to read processes.yaml")
    }
  })
})
