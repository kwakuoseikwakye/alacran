import { describe, it, expect } from "vitest"
import { getAllActivities, mergeAndSortActivities } from "./get-all-activities"
import type { Agent, Activity } from "./adapters/types"

const agentA: Agent = { id: "a", name: "Agent A", rootPath: "/tmp/a", kind: "pipeline" }
const agentB: Agent = { id: "b", name: "Agent B", rootPath: "/tmp/b", kind: "report-log" }

describe("getAllActivities", () => {
  it("isolates a throwing adapter from a healthy one", async () => {
    const results = await getAllActivities([agentA, agentB], {
      a: async () => {
        throw new Error("boom")
      },
      b: async () => [
        { id: "1", agentId: "b", type: "x", timestamp: 100, title: "ok", status: "done", detailPath: "/tmp/b/1" },
      ],
    })
    const a = results.find((r) => r.agent.id === "a")!
    const b = results.find((r) => r.agent.id === "b")!
    expect(a.error).toBe("boom")
    expect(a.activities).toEqual([])
    expect(b.error).toBeNull()
    expect(b.activities).toHaveLength(1)
  })

  it("reports a clear error when no adapter is registered", async () => {
    const results = await getAllActivities([agentA], {})
    expect(results[0].error).toBe('No adapter registered for agent "a"')
  })
})

describe("mergeAndSortActivities", () => {
  it("merges activities from multiple agents sorted by timestamp descending", () => {
    const results = [
      {
        agent: agentA,
        error: null,
        activities: [
          { id: "1", agentId: "a", type: "x", timestamp: 100, title: "old", status: "done", detailPath: "/tmp/1" } as Activity,
        ],
      },
      {
        agent: agentB,
        error: null,
        activities: [
          { id: "2", agentId: "b", type: "y", timestamp: 200, title: "new", status: "done", detailPath: "/tmp/2" } as Activity,
        ],
      },
    ]
    const merged = mergeAndSortActivities(results)
    expect(merged.map((a) => a.id)).toEqual(["2", "1"])
  })
})
