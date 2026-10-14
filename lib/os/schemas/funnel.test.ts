import { describe, it, expect } from "vitest"
import {
  LeadSchema,
  LeadsFileSchema,
  FunnelStageSchema,
  FunnelStagesFileSchema,
} from "./funnel"

describe("LeadSchema", () => {
  it("validates a complete lead record", () => {
    const fixture = {
      id: "acme-corp",
      name: "Acme Corp",
      stage: "negotiation",
      source: "attio",
      owner: "agent",
      value: 18000,
      currency: "USD",
      first_seen: "2026-08-26",
      last_touch: "2026-09-08",
      provenance: [
        { claim: "won't sign before Q4", said_by: "Ama", said_on: "2026-08-14", source: "slack" },
      ],
    }
    const parsed = LeadSchema.parse(fixture)
    expect(parsed.id).toBe("acme-corp")
    expect(parsed.value).toBe(18000)
    expect(parsed.provenance?.[0].said_by).toBe("Ama")
  })

  it("fails on invalid stage", () => {
    const fixture = {
      id: "bad-stage",
      name: "Bad Stage Inc",
      stage: "unrecognized",
      source: "manual",
      owner: "human",
      value: 1000,
      currency: "USD",
      first_seen: "2026-09-01",
      last_touch: "2026-09-02",
    }
    expect(() => LeadSchema.parse(fixture)).toThrow()
  })

  it("validates leads file with schema_version", () => {
    const file = {
      schema_version: 1,
      records: [
        {
          id: "beta-corp",
          name: "Beta Corp",
          stage: "qualified",
          source: "manual",
          owner: "human",
          value: 5000,
          currency: "USD",
          first_seen: "2026-09-01",
          last_touch: "2026-09-05",
        },
      ],
    }
    const parsed = LeadsFileSchema.parse(file)
    expect(parsed.schema_version).toBe(1)
    expect(parsed.records).toHaveLength(1)
  })
})

describe("FunnelStageSchema", () => {
  it("validates a stage record", () => {
    const stage = {
      id: "qualified",
      name: "Qualified",
      order: 2,
      probability: 0.4,
    }
    const parsed = FunnelStageSchema.parse(stage)
    expect(parsed.name).toBe("Qualified")
  })

  it("validates stages file", () => {
    const file = {
      schema_version: 1,
      records: [
        { id: "new", name: "New", order: 1 },
        { id: "won", name: "Won", order: 2, probability: 1 },
      ],
    }
    const parsed = FunnelStagesFileSchema.parse(file)
    expect(parsed.records).toHaveLength(2)
  })
})
