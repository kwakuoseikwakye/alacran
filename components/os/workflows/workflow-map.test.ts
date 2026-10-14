import { describe, it, expect } from "vitest"
import type { Workflow } from "@/lib/os/schemas/workflows"
import { getWorkflowById } from "./workflow-map"

const mockWorkflows: Workflow[] = [
  {
    id: "wf-1",
    name: "First Workflow",
    department: "content",
    description: "First description",
    steps: [
      {
        id: "step-1",
        title: "Step One",
        owner: "content-agent",
        owner_kind: "agent",
        hours_per_week: 3,
        tools: ["ghost"],
      },
    ],
  },
  {
    id: "wf-2",
    name: "Second Workflow",
    department: "operations",
    description: "Second description",
    steps: [
      {
        id: "step-2",
        title: "Step Two",
        owner: "dev-agent",
        owner_kind: "agent",
        hours_per_week: 5,
        tools: ["github"],
      },
    ],
  },
]

describe("getWorkflowById", () => {
  it("returns matching workflow when ID exists", () => {
    const result = getWorkflowById(mockWorkflows, "wf-2")
    expect(result).toBeDefined()
    expect(result?.id).toBe("wf-2")
    expect(result?.name).toBe("Second Workflow")
  })

  it("falls back to workflows[0] when ID is unknown or omitted", () => {
    const fallbackUnknown = getWorkflowById(mockWorkflows, "unknown-id")
    expect(fallbackUnknown?.id).toBe("wf-1")

    const fallbackUndefined = getWorkflowById(mockWorkflows, undefined)
    expect(fallbackUndefined?.id).toBe("wf-1")

    const fallbackNull = getWorkflowById(mockWorkflows, null)
    expect(fallbackNull?.id).toBe("wf-1")

    const fallbackOmitted = getWorkflowById(mockWorkflows)
    expect(fallbackOmitted?.id).toBe("wf-1")
  })

  it("returns null when workflows array is empty", () => {
    expect(getWorkflowById([])).toBeNull()
    expect(getWorkflowById([], "wf-1")).toBeNull()
    expect(getWorkflowById([], undefined)).toBeNull()
  })
})
