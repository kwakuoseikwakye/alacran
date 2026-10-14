import { describe, it, expect } from "vitest"
import { FunnelCockpit } from "./funnel-cockpit"
import type { FunnelViewModel } from "@/lib/os/departments/adapters/funnel-adapter"

describe("FunnelCockpit", () => {
  it("renders funnel space, controls, attention queue and journey table", () => {
    const model: FunnelViewModel = {
      summary: {
        clients: 10,
        converted: 2,
        revenueUsd: 45000,
        stages: [
          { stage: "first_touch", total: 10, organic: 6, ads: 4, conversionFromPrev: null },
          { stage: "engaged", total: 7, organic: 4, ads: 3, conversionFromPrev: 70 },
          { stage: "nurtured", total: 5, organic: 3, ads: 2, conversionFromPrev: 71.4 },
          { stage: "opted_in", total: 4, organic: 2, ads: 2, conversionFromPrev: 80 },
          { stage: "converted", total: 2, organic: 1, ads: 1, conversionFromPrev: 50 },
        ],
      },
      activeJourneys: [
        {
          id: "lead-1",
          name: "Acme Corp",
          venture: "all",
          status: "opted_in",
          relationship: "hot",
          likelihood: 80,
          amountUsd: 25000,
          createdAt: "2026-09-01",
          touches: [
            { id: "t-1", stage: "first_touch", channel: "organic", label: "Seen", at: "2026-09-01", source: "organic" },
          ],
          url: null,
          email: "acme@example.com",
          phone: null,
          person: "Bob Smith",
          company: "Acme Corp",
          role: "CEO",
          linkedin: null,
          product: null,
        },
      ],
      archivedJourneys: [],
      spaceNodes: [
        {
          id: "lead-1",
          name: "Acme Corp",
          venture: "all",
          status: "opted_in",
          relationship: "hot",
          likelihood: 80,
          state: "active",
          daysSinceLastTouch: 2,
          product: null,
          amountUsd: 25000,
          hubs: [0, 3],
          currentHub: 3,
          radius: 4.9,
          decay: 0,
          url: null,
          email: "acme@example.com",
          phone: null,
          person: "Bob Smith",
          company: "Acme Corp",
          role: "CEO",
          linkedin: null,
          touches: [
            { id: "t-1", stage: "first_touch", channel: "organic", label: "Seen", at: "2026-09-01", source: "organic" },
          ],
        },
      ],
      radial: {
        nodes: [],
        segments: [{ id: "instagram", label: "Instagram" }],
      },
      attention: {
        pushNow: [],
        saveNow: [],
      },
      isLive: true,
      liveLabel: "Attio live",
      connectors: [{ id: "attio", label: "Attio", status: "connected" }],
      stageCounts: {
        first_touch: 0,
        engaged: 0,
        nurtured: 0,
        opted_in: 1,
        converted: 0,
      },
    }

    const element = FunnelCockpit({ model, companyId: "alacran-app" })
    expect(element).toBeDefined()
    expect(element.props.className).toContain("space-y-5")
  })
})
