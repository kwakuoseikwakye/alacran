import { describe, it, expect } from "vitest"
import { buildBuiltins } from "./builtin-agents"

describe("buildBuiltins", () => {
  it("includes the builtin when its dir exists", () => {
    const b = buildBuiltins(() => true)
    expect(b.agents.map((a) => a.id)).toEqual(["ai-company-starter-main"])
  })

  it("includes none when no dir exists", () => {
    const b = buildBuiltins(() => false)
    expect(b.agents).toEqual([])
    expect(b.adapters).toEqual({})
    expect(b.skillAdapters).toEqual({})
  })

  it("keeps adapter maps in sync with the agent list in every gate state (machine-independent drift guard)", () => {
    const gates: Array<(p: string) => boolean> = [
      () => true,
      () => false,
      (p) => p.includes("ai-company-starter-main"),
    ]
    for (const exists of gates) {
      const b = buildBuiltins(exists)
      const ids = b.agents.map((a) => a.id).sort()
      expect(Object.keys(b.adapters).sort()).toEqual(ids)
      expect(Object.keys(b.skillAdapters).sort()).toEqual(ids)
    }
  })
})
