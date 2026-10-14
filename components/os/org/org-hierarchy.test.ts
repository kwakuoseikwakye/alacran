import { describe, it, expect } from "vitest"
import { mapRolesToDepartments } from "./department-column"

describe("mapRolesToDepartments", () => {
  it("correctly maps lead-developer with decisions to operations", () => {
    const roles = [
      {
        id: "lead-developer",
        name: "Technical & Product Lead",
        owns: "Core application architecture, multi-platform releases (macOS & Linux), CI/CD pipelines, and repository security.",
      },
    ]
    const decisions = [
      {
        decision: "Publishing software releases and packaging builds",
        approver: "lead-developer",
      },
      {
        decision: "Modifying external access tokens, secrets, and CI permissions",
        approver: "lead-developer",
      },
    ]

    const result = mapRolesToDepartments(roles, decisions)

    expect(result.operations).toHaveLength(1)
    expect(result.operations[0]).toEqual({
      id: "lead-developer",
      name: "Technical & Product Lead",
      owns: "Core application architecture, multi-platform releases (macOS & Linux), CI/CD pipelines, and repository security.",
      decisions: [
        "Publishing software releases and packaging builds",
        "Modifying external access tokens, secrets, and CI permissions",
      ],
    })
    expect(result.funnel).toEqual([])
    expect(result.finances).toEqual([])
    expect(result.social).toEqual([])
    expect(result.content).toEqual([])
  })

  it("correctly maps workspace-operator with decisions", () => {
    const roles = [
      {
        id: "workspace-operator",
        name: "Company Workspace Operator",
        owns: "Company ontology definitions, external integrations (Google, GitHub, Notion, Beeper), diff reviews, and daily business task execution.",
      },
    ]
    const decisions = [
      {
        decision: "Approving ontology changes and company scope updates",
        approver: "workspace-operator",
      },
      {
        decision: "Committing automated agent diffs from background or scheduled jobs",
        approver: "workspace-operator",
      },
    ]

    const result = mapRolesToDepartments(roles, decisions)

    expect(result.operations).toHaveLength(1)
    expect(result.operations[0].id).toBe("workspace-operator")
    expect(result.operations[0].name).toBe("Company Workspace Operator")
    expect(result.operations[0].decisions).toEqual([
      "Approving ontology changes and company scope updates",
      "Committing automated agent diffs from background or scheduled jobs",
    ])
  })

  it("matches custom roles containing department keywords", () => {
    const roles = [
      {
        id: "sales-lead",
        name: "Head of Sales & Deals",
        owns: "Enterprise funnel and CRM pipeline acceleration",
      },
      {
        id: "controller",
        name: "Accounting & Finance Lead",
        owns: "General ledger, tax compliance, and finance forecasts",
      },
      {
        id: "social-lead",
        name: "Audience & Community Lead",
        owns: "Social media reach and audience discussions",
      },
      {
        id: "head-writer",
        name: "Content Strategist & Editorial Writer",
        owns: "Publishing blog posts and content guides",
      },
    ]

    const decisions = [
      { decision: "Discounts over 20%", approver: "sales-lead" },
      { decision: "Wire transfers above $10,000", approver: "controller" },
      { decision: "Public announcements and brand responses", approver: "social-lead" },
      { decision: "Editorial calendar release", approver: "head-writer" },
    ]

    const result = mapRolesToDepartments(roles, decisions)

    expect(result.funnel).toHaveLength(1)
    expect(result.funnel[0].id).toBe("sales-lead")
    expect(result.funnel[0].decisions).toEqual(["Discounts over 20%"])

    expect(result.finances).toHaveLength(1)
    expect(result.finances[0].id).toBe("controller")
    expect(result.finances[0].decisions).toEqual(["Wire transfers above $10,000"])

    expect(result.social).toHaveLength(1)
    expect(result.social[0].id).toBe("social-lead")
    expect(result.social[0].decisions).toEqual(["Public announcements and brand responses"])

    expect(result.content).toHaveLength(1)
    expect(result.content[0].id).toBe("head-writer")
    expect(result.content[0].decisions).toEqual(["Editorial calendar release"])
  })

  it("returns empty arrays for departments without declared roles", () => {
    const result = mapRolesToDepartments([], [])

    expect(result).toEqual({
      funnel: [],
      finances: [],
      social: [],
      content: [],
      operations: [],
    })
  })

  it("handles roles with no assigned decisions", () => {
    const roles = [
      {
        id: "ci-engineer",
        name: "CI/CD & Architecture Engineer",
      },
    ]

    const result = mapRolesToDepartments(roles, [])

    expect(result.operations).toHaveLength(1)
    expect(result.operations[0].id).toBe("ci-engineer")
    expect(result.operations[0].decisions).toEqual([])
  })
})
