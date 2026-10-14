import { describe, it, expect } from "vitest"
import {
  GateCheckpointEnum,
  WorkflowAutomationSchema,
  WorkflowStepSchema,
  WorkflowSchema,
  WorkflowsFileSchema,
} from "./workflows"

describe("GateCheckpointEnum", () => {
  it("accepts valid checkpoint values", () => {
    const validValues = [
      "money",
      "contracts",
      "irreversible",
      "publication",
      "credentials",
    ]
    for (const val of validValues) {
      expect(GateCheckpointEnum.parse(val)).toBe(val)
    }
  })

  it("rejects invalid checkpoint string", () => {
    expect(() => GateCheckpointEnum.parse("invalid_checkpoint")).toThrow()
  })
})

describe("WorkflowAutomationSchema", () => {
  it("validates valid automation", () => {
    const data = {
      title: "Auto-triage",
      state: "live",
      recovered_usd: 1200,
    }
    const parsed = WorkflowAutomationSchema.parse(data)
    expect(parsed.state).toBe("live")
    expect(parsed.recovered_usd).toBe(1200)
  })

  it("rejects invalid state or negative recovered_usd", () => {
    expect(() =>
      WorkflowAutomationSchema.parse({
        title: "Bad",
        state: "in-progress",
        recovered_usd: 100,
      })
    ).toThrow()

    expect(() =>
      WorkflowAutomationSchema.parse({
        title: "Bad",
        state: "live",
        recovered_usd: -50,
      })
    ).toThrow()
  })
})

describe("WorkflowStepSchema", () => {
  it("validates a complete workflow step record", () => {
    const fixture = {
      id: "step-1",
      title: "Draft Proposal",
      owner: "alex",
      owner_kind: "human",
      hours_per_week: 4.5,
      tools: ["docs", "notion"],
      leak_usd: 500,
      gate_checkpoint: "contracts",
      automation: {
        title: "AI Drafter",
        state: "suggested",
        recovered_usd: 350,
      },
      edge_label: "Next: Review",
    }
    const parsed = WorkflowStepSchema.parse(fixture)
    expect(parsed.id).toBe("step-1")
    expect(parsed.gate_checkpoint).toBe("contracts")
    expect(parsed.tools).toEqual(["docs", "notion"])
  })

  it("defaults tools to empty array and permits nullish optional fields", () => {
    const fixture = {
      id: "step-2",
      title: "Deploy Agent",
      owner: "agent-builder",
      owner_kind: "agent",
      hours_per_week: 1,
    }
    const parsed = WorkflowStepSchema.parse(fixture)
    expect(parsed.tools).toEqual([])
    expect(parsed.leak_usd).toBeUndefined()
    expect(parsed.gate_checkpoint).toBeUndefined()
    expect(parsed.automation).toBeUndefined()
    expect(parsed.edge_label).toBeUndefined()
  })

  it("rejects invalid owner_kind and invalid gate_checkpoint", () => {
    expect(() =>
      WorkflowStepSchema.parse({
        id: "step-err",
        title: "Test",
        owner: "someone",
        owner_kind: "alien",
        hours_per_week: 2,
      })
    ).toThrow()

    expect(() =>
      WorkflowStepSchema.parse({
        id: "step-err",
        title: "Test",
        owner: "someone",
        owner_kind: "human",
        hours_per_week: 2,
        gate_checkpoint: "unauthorized_gate",
      })
    ).toThrow()
  })
})

describe("WorkflowSchema", () => {
  it("validates workflow and defaults steps to empty array", () => {
    const fixture = {
      id: "wf-sales",
      name: "Outbound Sales Pipeline",
      department: "Growth",
      description: "End-to-end outbound outreach and qualification.",
    }
    const parsed = WorkflowSchema.parse(fixture)
    expect(parsed.id).toBe("wf-sales")
    expect(parsed.steps).toEqual([])
  })

  it("validates workflow with embedded steps", () => {
    const fixture = {
      id: "wf-sales",
      name: "Outbound Sales Pipeline",
      department: "Growth",
      description: "End-to-end outbound outreach and qualification.",
      steps: [
        {
          id: "step-1",
          title: "Scrape Leads",
          owner: "scraper-bot",
          owner_kind: "agent",
          hours_per_week: 5,
          tools: ["apify"],
        },
      ],
    }
    const parsed = WorkflowSchema.parse(fixture)
    expect(parsed.steps).toHaveLength(1)
    expect(parsed.steps[0].id).toBe("step-1")
  })
})

describe("WorkflowsFileSchema", () => {
  it("validates workflows file structure", () => {
    const file = {
      schema_version: 1,
      records: [
        {
          id: "wf-1",
          name: "Customer Onboarding",
          department: "Operations",
          description: "Onboarding new enterprise clients.",
          steps: [],
        },
      ],
    }
    const parsed = WorkflowsFileSchema.parse(file)
    expect(parsed.schema_version).toBe(1)
    expect(parsed.records).toHaveLength(1)
  })

  it("rejects non-positive or non-integer schema_version", () => {
    expect(() =>
      WorkflowsFileSchema.parse({
        schema_version: 0,
        records: [],
      })
    ).toThrow()

    expect(() =>
      WorkflowsFileSchema.parse({
        schema_version: 1.5,
        records: [],
      })
    ).toThrow()
  })
})
