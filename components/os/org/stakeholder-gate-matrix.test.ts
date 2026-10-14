import { describe, it, expect } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import { StakeholderGateMatrix, HUMAN_GATE_ROWS } from "./stakeholder-gate-matrix"

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
}

describe("StakeholderGateMatrix", () => {
  it("defines all 5 §6 Human Gate rows", () => {
    expect(HUMAN_GATE_ROWS).toHaveLength(5)
    const rowNames = HUMAN_GATE_ROWS.map((r) => r.name)
    expect(rowNames).toContain("Money")
    expect(rowNames).toContain("Contracts")
    expect(rowNames).toContain("Irreversible operations")
    expect(rowNames).toContain("Publication")
    expect(rowNames).toContain("Credentials")
  })

  it("renders real stakeholders from ontology", () => {
    render(
      React.createElement(StakeholderGateMatrix, {
        companyId: "test-co",
        stakeholders: [{ role: "Lead Architect", position: "Technical Strategy & Approvals" }],
        agents: [{ id: "claude-code", name: "Claude Code CLI", status: "connected" }],
        pendingCount: 2,
      })
    )
    expect(screen.getByText("Lead Architect")).toBeDefined()
    expect(screen.getByText("Technical Strategy & Approvals")).toBeDefined()
    expect(screen.getByText("Claude Code CLI")).toBeDefined()
  })

  it("renders all 5 gate rows in the Human Gate Matrix table", () => {
    render(
      React.createElement(StakeholderGateMatrix, {
        companyId: "test-co",
        stakeholders: [
          { role: "workspace-operator", name: "Company Workspace Operator", owns: "Daily tasks" },
        ],
        agents: [
          { id: "antigravity", name: "Google Antigravity", status: "connected" },
          { id: "kiro", name: "Kiro CLI", status: "connected" },
        ],
        pendingCount: 0,
      })
    )
    expect(screen.getByText("Money")).toBeDefined()
    expect(screen.getByText("Contracts")).toBeDefined()
    expect(screen.getByText("Irreversible operations")).toBeDefined()
    expect(screen.getByText("Publication")).toBeDefined()
    expect(screen.getByText("Credentials")).toBeDefined()
    expect(screen.getByText("Company Workspace Operator")).toBeDefined()
    expect(screen.getByText("Google Antigravity")).toBeDefined()
    expect(screen.getByText("Kiro CLI")).toBeDefined()
  })

  it("accepts pendingReviews array or numeric pendingCount", () => {
    render(
      React.createElement(StakeholderGateMatrix, {
        companyId: "test-co",
        stakeholders: [{ role: "Operator", position: "Lead" }],
        agents: [{ id: "kimi", name: "Kimi CLI", status: "not_configured" }],
        pendingReviews: [{ id: "rev-1" }, { id: "rev-2" }, { id: "rev-3" }],
      })
    )
    expect(screen.getByText("Operator")).toBeDefined()
    expect(screen.getByText("Kimi CLI")).toBeDefined()
    expect(screen.getByText(/3 pending/i)).toBeDefined()
  })

  it("renders §6 stopping rules verbatim from AGENTS.md", () => {
    render(
      React.createElement(StakeholderGateMatrix, {
        companyId: "test-co",
        stakeholders: [],
        agents: [],
      })
    )
    expect(screen.getByText(/Draft the number\. Show it\. Don't treat it as agreed\./i)).toBeDefined()
    expect(screen.getByText(/Draft it in full\. It's a draft until a human says otherwise\./i)).toBeDefined()
    expect(screen.getByText(/Say exactly what would be destroyed, then wait\./i)).toBeDefined()
    expect(screen.getByText(/Write it\. Show it\. Never send it\./i)).toBeDefined()
    expect(screen.getByText(/Say what you'd change and who gains access\. Never do it unasked\./i)).toBeDefined()
    expect(screen.getByText("No stakeholders registered yet")).toBeDefined()
    expect(screen.getByText("No CLI agents detected")).toBeDefined()
    expect(screen.getByText("All Gates Clear (0 pending)")).toBeDefined()
  })

  it("renders registered company departments and operational units", () => {
    render(
      React.createElement(StakeholderGateMatrix, {
        companyId: "test-co",
        departments: [
          {
            id: "engineering",
            name: "Engineering & Architecture",
            slug: "engineering",
            tagline: "Core systems, repository structure, and technical execution.",
            color: "#6366f1",
            recordsCount: 4,
            source: "discovered",
            roles: [{ id: "lead-architect", name: "Lead Architect" }],
          },
          {
            id: "funnel",
            name: "Value Pipeline & Sales",
            slug: "funnel",
            tagline: "Pipeline velocity, customer conversions, and growth metrics.",
            color: "#10b981",
            recordsCount: 2,
            source: "discovered",
            roles: [{ id: "sales-lead", name: "Growth Lead" }],
          },
        ],
      })
    )
    expect(screen.getByText("Company Departments & Operational Units")).toBeDefined()
    expect(screen.getByText("Engineering & Architecture")).toBeDefined()
    expect(screen.getByText("Value Pipeline & Sales")).toBeDefined()
    expect(screen.getByText("2 active departments")).toBeDefined()
    expect(screen.getByText("Lead Architect")).toBeDefined()
    expect(screen.getByText("Growth Lead")).toBeDefined()
  })
})
