import { describe, it, expect } from "vitest"
import { buildBuiltins } from "./builtin-agents"

describe("buildBuiltins", () => {
  it("includes all 3 builtins when every dir exists", () => {
    const b = buildBuiltins(() => true)
    expect(b.agents.map((a) => a.id).sort()).toEqual([
      "ai-company-starter-main",
      "plh-ops",
      "email-pipeline-agent",
    ])
  })

  it("includes none when no dir exists", () => {
    const b = buildBuiltins(() => false)
    expect(b.agents).toEqual([])
    expect(b.adapters).toEqual({})
    expect(b.skillAdapters).toEqual({})
  })

  it("includes only the subset whose dirs exist", () => {
    const b = buildBuiltins((p) => p.endsWith("plh-ops"))
    expect(b.agents.map((a) => a.id)).toEqual(["plh-ops"])
    expect(Object.keys(b.adapters)).toEqual(["plh-ops"])
    expect(Object.keys(b.skillAdapters)).toEqual(["plh-ops"])
  })

  it("keeps adapter maps in sync with the agent list in every gate state (machine-independent drift guard)", () => {
    const gates: Array<(p: string) => boolean> = [
      () => true,
      () => false,
      (p) => p.includes("pipeline"),
    ]
    for (const exists of gates) {
      const b = buildBuiltins(exists)
      const ids = b.agents.map((a) => a.id).sort()
      expect(Object.keys(b.adapters).sort()).toEqual(ids)
      expect(Object.keys(b.skillAdapters).sort()).toEqual(ids)
    }
  })
})
