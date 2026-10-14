import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, it, expect, vi } from "vitest"
import { UnifiedConnectionsBoard } from "./unified-connections-board"
import type { ConnectStatus } from "@/lib/connect/connect-status-impl"
import type { CatalogEntry } from "@/lib/os/connectors/integrations-catalog"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/system/connectors",
  useSearchParams: () => new URLSearchParams(),
}))

let advancedMode = false
vi.mock("@/components/advanced-only", () => ({ useAdvancedMode: () => advancedMode }))

vi.mock("./api-keys", () => ({
  ApiKeys: () => React.createElement("div", { "data-testid": "api-keys-mock" }, "API Keys Panel"),
}))

vi.mock("@/components/connect-help", () => ({
  ConnectHelp: () => React.createElement("button", null, "Help"),
}))

describe("UnifiedConnectionsBoard", () => {
  const mockConnectStatus: ConnectStatus = {
    aiExecutors: [
      {
        id: "claude-code",
        label: "Claude Code CLI",
        connected: true,
        detail: "Connected as test@example.com",
        guidance: { steps: [] },
      },
    ],
    google: {
      id: "google",
      label: "Google",
      connected: true,
      detail: "1 account connected (test@example.com)",
      guidance: { steps: [] },
      accounts: ["test@example.com"],
      grantedServices: ["gmail", "calendar"],
    },
    github: {
      id: "github",
      label: "GitHub",
      connected: false,
      detail: "Run `gh auth login`",
      guidance: { steps: ["Run gh auth login"] },
    },
    beeper: {
      id: "beeper",
      label: "Beeper",
      connected: false,
      detail: "Beeper desktop CLI not found",
      guidance: { steps: [] },
    },
    outlook: {
      id: "outlook",
      label: "Outlook",
      connected: false,
      detail: "Not signed in to Outlook yet.",
      guidance: { steps: [] },
    },
    notion: {
      companies: [{ agentId: "c1", companyName: "Acme", connected: true }],
    },
    departmentConnectors: [],
  }

  const mockCatalog: CatalogEntry[] = [
    {
      slug: "claude-code",
      name: "Claude Code",
      tagline: "Anthropic agentic CLI",
      category: "AI & Automation",
      mechanism: "cli",
      connected: true,
      keySaved: true,
      popular: true,
    },
    {
      slug: "beeper",
      name: "Beeper",
      tagline: "Unified local chat bridge",
      category: "Communication",
      mechanism: "cli",
      connected: false,
      keySaved: false,
      popular: true,
    },
    {
      slug: "slack",
      name: "Slack",
      tagline: "Channels & DMs",
      category: "Communication",
      mechanism: "api-key",
      connected: true,
      keySaved: true,
      popular: true,
    },
    {
      slug: "notion",
      name: "Notion",
      tagline: "Docs & databases",
      category: "Productivity",
      mechanism: "api-key",
      connected: false,
      keySaved: false,
      popular: true,
    },
    {
      slug: "figma",
      name: "Figma",
      tagline: "Design tokens via Figma MCP",
      category: "Creative",
      mechanism: "mcp",
      mcpUrl: "https://mcp.figma.com/mcp",
      connected: false,
      keySaved: false,
      popular: true,
    },
  ]

  const render = () =>
    renderToStaticMarkup(
      React.createElement(UnifiedConnectionsBoard, {
        initialConnectStatus: mockConnectStatus,
        initialCatalog: mockCatalog,
      })
    )

  it("leads a simple-mode user with the tools that matter, without the mechanism tabs", () => {
    advancedMode = false
    const html = render()

    expect(html).toContain("Connections")
    expect(html).toContain("Re-check")
    expect(html).toContain("Help")
    expect(html).toContain("Set up first")
    expect(html).toContain("Claude Code")
    expect(html).toContain("All tools")

    // How a tool connects, and the raw key file editor, are Advanced only.
    expect(html).not.toContain("MCP Servers (1)")
    expect(html).not.toContain("API Keys Panel")
  })

  it("keeps the mechanism tabs and key panel in advanced mode", () => {
    advancedMode = true
    const html = render()

    expect(html).toContain("All (5)")
    expect(html).toContain("MCP Servers (1)")
    expect(html).toContain("API Keys (2)")
    expect(html).toContain("CLI Bridges (2)")
    expect(html).toContain("API Keys Panel")
    expect(html).toContain("Slack")
  })
})
