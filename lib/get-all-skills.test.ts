import { describe, it, expect } from "vitest"
import { getAllSkills, mergeAndSortSkills } from "./get-all-skills"
import type { Agent } from "./adapters/types"
import type { SkillEntry } from "./skills/types"

const agentA: Agent = { id: "a", name: "Agent A", rootPath: "/tmp/a", kind: "pipeline" }
const agentB: Agent = { id: "b", name: "Agent B", rootPath: "/tmp/b", kind: "report-log" }

describe("getAllSkills", () => {
  it("isolates a throwing adapter from a healthy one", async () => {
    const results = await getAllSkills([agentA, agentB], {
      a: async () => {
        throw new Error("boom")
      },
      b: async () => [
        { id: "1", agentId: "b", kind: "skill", name: "z-skill", description: "", path: "/tmp/b/1" },
      ],
    })
    const a = results.find((r) => r.agent.id === "a")!
    const b = results.find((r) => r.agent.id === "b")!
    expect(a.error).toBe("boom")
    expect(a.entries).toEqual([])
    expect(b.error).toBeNull()
    expect(b.entries).toHaveLength(1)
  })

  it("reports a clear error when no adapter is registered", async () => {
    const results = await getAllSkills([agentA], {})
    expect(results[0].error).toBe('No skill adapter registered for agent "a"')
  })
})

describe("mergeAndSortSkills", () => {
  it("merges entries from multiple agents sorted alphabetically by name", () => {
    const results = [
      {
        agent: agentA,
        error: null,
        entries: [
          { id: "1", agentId: "a", kind: "skill", name: "z-skill", description: "", path: "/tmp/1" } as SkillEntry,
        ],
      },
      {
        agent: agentB,
        error: null,
        entries: [
          { id: "2", agentId: "b", kind: "command", name: "a-command", description: "", path: "/tmp/2" } as SkillEntry,
        ],
      },
    ]
    const merged = mergeAndSortSkills(results)
    expect(merged.map((e) => e.id)).toEqual(["2", "1"])
  })
})
