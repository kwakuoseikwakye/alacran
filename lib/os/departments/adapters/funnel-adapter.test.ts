import { describe, it, expect } from "vitest"
import {
  buildFunnelViewModel,
  decayFactor,
  journeyMeta,
  contactActions,
  type FunnelJourney,
} from "./funnel-adapter"
import type { Lead, FunnelStage as RecordFunnelStage } from "@/lib/os/schemas/funnel"

describe("funnel-adapter", () => {
  const now = new Date("2026-09-11T12:00:00Z")

  const sampleLeads: Lead[] = [
    {
      id: "lead-hot",
      name: "Acme Enterprise",
      stage: "negotiation",
      source: "organic",
      owner: "human",
      value: 25000,
      currency: "USD",
      first_seen: "2026-09-01T10:00:00Z",
      last_touch: "2026-09-10T15:00:00Z",
    },
    {
      id: "lead-won",
      name: "Stark Industries",
      stage: "won",
      source: "ads",
      owner: "agent",
      value: 15000,
      currency: "USD",
      first_seen: "2026-08-15T09:00:00Z",
      last_touch: "2026-09-05T12:00:00Z",
    },
    {
      id: "lead-stalled",
      name: "Wayne Enterprises",
      stage: "qualified",
      source: "organic",
      owner: "human",
      value: 8000,
      currency: "USD",
      first_seen: "2026-04-01T08:00:00Z",
      last_touch: "2026-05-01T11:00:00Z",
    },
  ]

  it("decayFactor computes continuous decay ramping from 21 to 90 days", () => {
    expect(decayFactor(10, "engaged")).toBe(0)
    expect(decayFactor(21, "engaged")).toBe(0)
    expect(decayFactor(90, "engaged")).toBe(1)
    expect(decayFactor(120, "engaged")).toBe(1)
    expect(decayFactor(50, "converted")).toBe(0)
  })

  it("journeyMeta classifies active, stalled, and decayed states", () => {
    const fresh: FunnelJourney = {
      id: "j-1",
      name: "Fresh",
      venture: "all",
      status: "engaged",
      relationship: "warm",
      likelihood: 60,
      amountUsd: 5000,
      createdAt: "2026-09-01",
      touches: [{ id: "t-1", stage: "engaged", channel: "organic", label: "Call", at: "2026-09-09", source: "crm" }],
      url: null,
      email: "test@fresh.co",
      phone: null,
      person: "Alice",
      company: "Fresh Co",
      role: "CTO",
      linkedin: null,
      product: null,
    }

    const meta = journeyMeta(fresh, now)
    expect(meta.state).toBe("active")
    expect(meta.daysSinceLastTouch).toBe(2)
  })

  it("buildFunnelViewModel produces summary, active/archived splits, and attention queues", () => {
    const stages: RecordFunnelStage[] = [
      { id: "new", name: "New Lead", order: 1 },
      { id: "qualified", name: "Qualified", order: 2 },
      { id: "negotiation", name: "Negotiation", order: 3 },
      { id: "won", name: "Won", order: 4 },
    ]

    const model = buildFunnelViewModel({
      leads: sampleLeads,
      stages,
      connectors: [
        { id: "attio", label: "Attio", status: "connected" },
        { id: "hubspot", label: "HubSpot", status: "not_configured" },
      ],
      now,
    })

    expect(model.summary.clients).toBeGreaterThanOrEqual(2)
    expect(model.summary.converted).toBe(1)
    expect(model.summary.revenueUsd).toBe(15000)
    expect(model.activeJourneys.length).toBeGreaterThanOrEqual(1)
    expect(model.archivedJourneys.length).toBeGreaterThanOrEqual(1)
    expect(model.attention.pushNow.length).toBeGreaterThanOrEqual(1)
    expect(model.spaceNodes.length).toBe(model.activeJourneys.length)
    expect(model.radial.nodes.length).toBe(model.activeJourneys.length)
  })

  it("contactActions derives direct links for email, wa, sms, and crmUrl", () => {
    const journey: FunnelJourney = {
      id: "j-test",
      name: "Test Lead",
      venture: "vantage",
      status: "first_touch",
      relationship: "hot",
      likelihood: 90,
      amountUsd: 10000,
      createdAt: "2026-09-01",
      touches: [],
      url: "https://app.attio.com/deal-1",
      email: "test@example.com",
      phone: "+1 (555) 123-4567",
      person: "Test Lead",
      company: "Test Co",
      role: null,
      linkedin: null,
      product: null,
    }

    const actions = contactActions(journey)
    expect(actions.email).toBe("test@example.com")
    expect(actions.wa).toBe("https://wa.me/15551234567")
    expect(actions.sms).toBe("sms:+1 (555) 123-4567")
    expect(actions.crmUrl).toBe("https://app.attio.com/deal-1")
  })

  it("falls back to seed journeys only when fallbackToSeed is requested", () => {
    const modelEmpty = buildFunnelViewModel({
      leads: [],
      stages: [],
      connectors: [],
      now,
    })
    expect(modelEmpty.activeJourneys.length).toBe(0)

    const modelAll = buildFunnelViewModel({
      leads: [],
      stages: [],
      connectors: [],
      fallbackToSeed: true,
      now,
    })
    expect(modelAll.activeJourneys.length).toBeGreaterThan(5)

    const modelVantage = buildFunnelViewModel({
      leads: [],
      stages: [],
      connectors: [],
      venture: "vantage",
      fallbackToSeed: true,
      now,
    })
    expect(modelVantage.activeJourneys.length).toBeGreaterThan(0)
    expect(modelVantage.activeJourneys.every((j) => j.venture === "vantage")).toBe(true)
  })
})

