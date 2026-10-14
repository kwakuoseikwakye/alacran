import { describe, it, expect } from "vitest"
import {
  WikiLink,
  AgentHarnessCard,
  HeadDetailCard,
} from "./knowledge-detail"

describe("KnowledgeDetail inspector cards", () => {
  it("renders WikiLink component", () => {
    const el = WikiLink({ label: "Attio CRM", mcp: true })
    expect(el).toBeDefined()
  })

  it("renders AgentHarnessCard", () => {
    const agent = {
      name: "Sales Agent",
      role: "Closer",
      model: "gpt-4o",
      tier: "lead",
      instance: "builtin",
      description: "Handles outbound and inbound sales deals.",
      tools: ["attio"],
    }
    const el = AgentHarnessCard({
      agent,
      task: null,
      parentName: null,
      parentAgentId: null,
      subAgents: [],
      lastRun: null,
      onClose: () => {},
    })
    expect(el).toBeDefined()
  })

  it("renders HeadDetailCard", () => {
    const el = HeadDetailCard({
      title: "Marco",
      deptName: "Sales",
      color: "#ef4444",
      boardLead: null,
      sops: [{ id: "task-1", title: "Outreach", skillName: "Pipeline" }],
      onClose: () => {},
    })
    expect(el).toBeDefined()
  })
})
