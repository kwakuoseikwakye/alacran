import { describe, it, expect } from "vitest"
import { AGENTS, ADAPTERS, SKILL_ADAPTERS } from "./config"

describe("AGENTS/ADAPTERS wiring", () => {
  it("registers exactly one adapter per configured agent", () => {
    const agentIds = AGENTS.map((a) => a.id).sort()
    const adapterIds = Object.keys(ADAPTERS).sort()
    expect(adapterIds).toEqual(agentIds)
  })

  it("gives every agent a unique id", () => {
    const ids = AGENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("registers exactly one skill adapter per configured agent", () => {
    const agentIds = AGENTS.map((a) => a.id).sort()
    const skillAdapterIds = Object.keys(SKILL_ADAPTERS).sort()
    expect(skillAdapterIds).toEqual(agentIds)
  })
})
