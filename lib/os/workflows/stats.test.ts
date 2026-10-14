import { describe, it, expect } from "vitest"
import { computeWorkflowStats, formatUsdCompact } from "./stats"
import type { WorkflowStep } from "../schemas/workflows"

describe("computeWorkflowStats", () => {
  it("calculates totals across workflow steps", () => {
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        title: "Drafting",
        owner: "ai",
        owner_kind: "agent",
        hours_per_week: 4,
        tools: ["claude"],
        leak_usd: 300,
        automation: { title: "Draft", state: "live", recovered_usd: 500 },
      },
      {
        id: "s2",
        title: "Approval",
        owner: "human",
        owner_kind: "human",
        hours_per_week: 2,
        tools: ["gmail"],
        gate_checkpoint: "publication",
      },
    ]

    const stats = computeWorkflowStats(steps)
    expect(stats.manualHours).toBe(2) // only human counts towards manual hours
    expect(stats.totalLeak).toBe(300)
    expect(stats.totalRecovered).toBe(500)
    expect(stats.gateCount).toBe(1)
  })

  it("ignores suggested automation in recovered_usd and only counts live", () => {
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        title: "Suggested Tool",
        owner: "ai",
        owner_kind: "agent",
        hours_per_week: 1,
        tools: [],
        automation: { title: "Idea", state: "suggested", recovered_usd: 1200 },
      },
      {
        id: "s2",
        title: "Live Tool",
        owner: "ai",
        owner_kind: "agent",
        hours_per_week: 2,
        tools: [],
        automation: { title: "Active Bot", state: "live", recovered_usd: 400 },
      },
    ]

    const stats = computeWorkflowStats(steps)
    expect(stats.totalRecovered).toBe(400)
  })

  it("handles empty list and zero values", () => {
    const stats = computeWorkflowStats([])
    expect(stats).toEqual({
      manualHours: 0,
      totalLeak: 0,
      totalRecovered: 0,
      gateCount: 0,
    })
  })

  it("handles steps with nullish leak_usd, gate_checkpoint, and automation", () => {
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        title: "Human Step",
        owner: "operator",
        owner_kind: "human",
        hours_per_week: 5,
        tools: ["terminal"],
        leak_usd: null,
        gate_checkpoint: null,
        automation: null,
      },
    ]

    const stats = computeWorkflowStats(steps)
    expect(stats.manualHours).toBe(5)
    expect(stats.totalLeak).toBe(0)
    expect(stats.totalRecovered).toBe(0)
    expect(stats.gateCount).toBe(0)
  })
})

describe("formatUsdCompact", () => {
  it("formats sub-thousand values", () => {
    expect(formatUsdCompact(0)).toBe("$0")
    expect(formatUsdCompact(250)).toBe("$250")
    expect(formatUsdCompact(999)).toBe("$999")
  })

  it("formats exact thousands without decimal", () => {
    expect(formatUsdCompact(1000)).toBe("$1k")
    expect(formatUsdCompact(5000)).toBe("$5k")
    expect(formatUsdCompact(10000)).toBe("$10k")
  })

  it("formats fractional thousands with one decimal place", () => {
    expect(formatUsdCompact(1500)).toBe("$1.5k")
    expect(formatUsdCompact(2400)).toBe("$2.4k")
    expect(formatUsdCompact(12300)).toBe("$12.3k")
  })
})
