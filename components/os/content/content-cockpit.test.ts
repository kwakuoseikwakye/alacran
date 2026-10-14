import { describe, it, expect } from "vitest"
import { ContentCockpit } from "./content-cockpit"
import type { ContentViewModel } from "@/lib/os/departments/adapters/content-adapter"

describe("ContentCockpit", () => {
  it("renders content intelligence backlinks, agents crew, pipeline and lead magnets", () => {
    const model: ContentViewModel = {
      crew: [
        {
          id: "agent-lead",
          name: "Content Strategist",
          role: "Lead Director",
          model: "claude-3-7-sonnet",
          status: "active",
          description: "Leads content production",
          tools: ["search", "write"],
          isLead: true,
        },
      ],
      pipeline: [
        {
          id: "item-1",
          platform: "blog",
          caption: "AI Systems in Enterprise",
          url: "https://example.com/post",
          ago: "2d",
          status: "published",
        },
      ],
      leadMagnets: [
        {
          id: "lm-1",
          title: "Operating Systems Guide",
          url: "https://example.com/guide",
          subscribers: 180,
          status: "live",
        },
      ],
      activeDays: 14,
      connectors: [{ id: "ghost", label: "Ghost", status: "connected" }],
      isLive: true,
    }

    const element = ContentCockpit({ model, companyId: "alacran-app" })
    expect(element).toBeDefined()
    expect(element.props.className).toContain("space-y-8")
  })
})
