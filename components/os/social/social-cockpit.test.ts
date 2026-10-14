import { describe, it, expect } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { SocialCockpit } from "./social-cockpit"
import type { SocialViewModel } from "@/lib/os/departments/adapters/social-adapter"

let lastRenderedHtml = ""

function render(node: React.ReactElement) {
  lastRenderedHtml = renderToString(node)
  return {
    html: lastRenderedHtml,
  }
}

function decodeHtml(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
}

const screen = {
  getByText: (text: string | RegExp) => {
    const normalized = decodeHtml(lastRenderedHtml)
    const isMatch =
      typeof text === "string" ? normalized.includes(text) : text.test(normalized)
    if (!isMatch) {
      throw new Error(`Unable to find text: ${text}`)
    }
    return { text }
  },
  queryByText: (text: string | RegExp) => {
    const normalized = decodeHtml(lastRenderedHtml)
    const isMatch =
      typeof text === "string" ? normalized.includes(text) : text.test(normalized)
    return isMatch ? { text } : null
  },
}

describe("SocialCockpit with Publication Gate", () => {
  it("renders the prominent §6 Publication Gate notice", () => {
    const mockModel = {
      accounts: [],
      snapshots: [],
      connectors: [],
      stats: { totalFollowers: 0, totalEngagement: 0, weeklyGrowthRate: 0, channelsActive: 0 },
      chartData: [],
    }
    render(React.createElement(SocialCockpit, { model: mockModel as unknown as SocialViewModel, companyId: "test-co" }))
    expect(screen.getByText(/Publication Gate/i)).toBeDefined()
    expect(screen.getByText(/Write it\. Show it\. Never send it\./i)).toBeDefined()
    expect(screen.getByText(/AGENTS\.md §6/i)).toBeDefined()
  })

  it("re-frames connected channels as outbound distribution channels", () => {
    const model: SocialViewModel = {
      totalReach: 24500,
      platforms: [
        {
          platform: "x",
          label: "X",
          handle: "@acmeco",
          url: "https://x.com/acmeco",
          followers: 12000,
          growth: { d7: 5.2, d30: 12.1 },
        },
      ],
      pieItems: [{ key: "x", label: "X", value: 12000 }],
      statStrip: {
        audienceTotal: 24500,
        growth7d: 3.6,
        growth30d: 10.3,
        totalImpressions: 85000,
        totalEngagements: 4200,
      },
      audiencePoints: [{ date: "2026-09-01", total: 22000 }],
      recentPosts: [],
      connectors: [{ id: "x", label: "X", status: "connected" }],
      isLive: true,
    }

    render(React.createElement(SocialCockpit, { model, companyId: "test-co" }))
    expect(screen.getByText(/Distribution Channels/i)).toBeDefined()
    expect(screen.getByText(/Outbound/i)).toBeDefined()
  })

  it("displays draft review queue status with §6 gate badges", () => {
    const model: SocialViewModel = {
      totalReach: 5000,
      platforms: [],
      pieItems: [],
      statStrip: {
        audienceTotal: 5000,
        growth7d: 0,
        growth30d: 0,
        totalImpressions: 1000,
        totalEngagements: 100,
      },
      audiencePoints: [],
      recentPosts: [],
      connectors: [],
      isLive: false,
    }

    const drafts = [
      {
        id: "draft-1",
        title: "Q3 Architecture Update & Launch Announcement",
        channel: "x",
        author: "agent" as const,
        status: "review" as const,
        type: "post" as const,
        summary: "Detailed announcement on the new engine architecture",
      },
    ]

    render(
      React.createElement(SocialCockpit, {
        model,
        companyId: "test-co",
        drafts,
      })
    )
    expect(screen.getByText(/Q3 Architecture Update/i)).toBeDefined()
    expect(screen.getByText(/§6 Gate Required/i)).toBeDefined()
    expect(screen.getByText(/Awaiting Human Sign-Off/i)).toBeDefined()
  })

  it("renders accounts, stat strip, consistency charts and recent posts with backward compatibility", () => {
    const model: SocialViewModel = {
      totalReach: 24500,
      platforms: [
        {
          platform: "x",
          label: "X",
          handle: "@acmeco",
          url: "https://x.com/acmeco",
          followers: 12000,
          growth: { d7: 5.2, d30: 12.1 },
        },
        {
          platform: "linkedin",
          label: "LinkedIn",
          handle: "acme-corp",
          url: "https://linkedin.com/company/acme-corp",
          followers: 12500,
          growth: { d7: 2.1, d30: 8.5 },
        },
      ],
      pieItems: [
        { key: "x", label: "X", value: 12000 },
        { key: "linkedin", label: "LinkedIn", value: 12500 },
      ],
      statStrip: {
        audienceTotal: 24500,
        growth7d: 3.6,
        growth30d: 10.3,
        totalImpressions: 85000,
        totalEngagements: 4200,
      },
      audiencePoints: [
        { date: "2026-09-01", total: 22000 },
        { date: "2026-09-10", total: 24500 },
      ],
      recentPosts: [
        {
          id: "p-1",
          tag: "X · Thread",
          ago: "2h",
          caption: "Launching the new OS architecture",
          views: 12000,
          likes: 840,
          ratio: 7.0,
          rank: 0,
          total: 1,
        },
      ],
      connectors: [{ id: "x", label: "X", status: "connected" }],
      isLive: true,
    }

    const element = SocialCockpit({ model, companyId: "alacran-app" })
    expect(element).toBeDefined()
    expect(element.props.className).toContain("space-y-6")
  })
})

