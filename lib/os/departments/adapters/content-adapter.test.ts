import { describe, it, expect } from "vitest"
import {
  buildContentViewModel,
  prettyTool,
  type ContentAgentModel,
} from "./content-adapter"
import type { ContentItem } from "@/lib/os/schemas/content"

describe("content-adapter", () => {
  const sampleItems: ContentItem[] = [
    {
      id: "c-1",
      title: "Building Autonomous Agent Workflows",
      status: "published",
      type: "article",
      channel: "blog",
      author: "agent",
      publish_date: "2026-09-08",
      url: "https://example.com/blog/agents",
    },
    {
      id: "c-2",
      title: "How Plain Files Beat Complex Databases",
      status: "published",
      type: "newsletter",
      channel: "beehiiv",
      author: "human",
      publish_date: "2026-09-10",
      url: "https://newsletter.example.com/p/plain-files",
    },
    {
      id: "c-3",
      title: "AI Operating System Cheat Sheet",
      status: "published",
      type: "documentation",
      channel: "landing_page",
      author: "agent",
      publish_date: "2026-09-01",
      url: "https://example.com/cheatsheet",
    },
  ]

  it("prettyTool formats kebab-case tool names cleanly", () => {
    expect(prettyTool("web-search")).toBe("Web Search")
    expect(prettyTool("generate_image")).toBe("Generate Image")
  })

  it("buildContentViewModel extracts agents, pipeline items, and lead magnets", () => {
    const model = buildContentViewModel({
      items: sampleItems,
      connectors: [
        { id: "ghost", label: "Ghost", status: "connected" },
        { id: "beehiiv", label: "Beehiiv", status: "not_configured" },
      ],
      companyId: "alacran-app",
      now: new Date("2026-09-11T12:00:00Z"),
    })

    expect(model.crew.length).toBeGreaterThanOrEqual(1)
    const lead = model.crew.find((a: ContentAgentModel) => a.isLead)
    expect(lead).toBeDefined()
    expect(model.pipeline.length).toBe(3)
    expect(model.leadMagnets.length).toBeGreaterThanOrEqual(1)
    expect(model.connectors.length).toBe(2)
  })
})
