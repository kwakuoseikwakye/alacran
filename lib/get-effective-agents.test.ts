import { describe, it, expect, afterEach, vi } from "vitest"

afterEach(() => {
  vi.resetModules()
})

describe("get-effective-agents", () => {
  it("returns just the static agents when no companies are registered", async () => {
    vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))
    const { getEffectiveAgents } = await import("./get-effective-agents")
    const { AGENTS } = await import("./config")

    const agents = await getEffectiveAgents()

    expect(agents).toEqual(AGENTS)
  })

  it("appends registered companies as command-set agents", async () => {
    vi.doMock("./companies-registry", () => ({
      getRegisteredCompanies: async () => [{ id: "second-co", name: "Second Co", rootPath: "/fake/second-co" }],
    }))
    const { getEffectiveAgents } = await import("./get-effective-agents")
    const { AGENTS } = await import("./config")

    const agents = await getEffectiveAgents()

    expect(agents).toEqual([
      ...AGENTS,
      { id: "second-co", name: "Second Co", rootPath: "/fake/second-co", kind: "command-set" },
    ])
  })

  it("registers the generic skill adapter for each registered company", async () => {
    vi.doMock("./companies-registry", () => ({
      getRegisteredCompanies: async () => [{ id: "second-co", name: "Second Co", rootPath: "/fake/second-co" }],
    }))
    const { getEffectiveSkillAdapters } = await import("./get-effective-agents")
    const { SKILL_ADAPTERS } = await import("./config")
    const { genericCommandSetSkillAdapter } = await import("./skills/generic-command-set")

    const adapters = await getEffectiveSkillAdapters()

    expect(adapters["second-co"]).toBe(genericCommandSetSkillAdapter)
    for (const id of Object.keys(SKILL_ADAPTERS)) {
      expect(adapters[id]).toBe(SKILL_ADAPTERS[id])
    }
  })

  it("registers a generic git-log activity adapter for each registered company", async () => {
    vi.doMock("./companies-registry", () => ({
      getRegisteredCompanies: async () => [{ id: "second-co", name: "Second Co", rootPath: "/fake/second-co" }],
    }))
    const { getEffectiveAdapters } = await import("./get-effective-agents")
    const { ADAPTERS } = await import("./config")

    const adapters = await getEffectiveAdapters()

    expect(typeof adapters["second-co"]).toBe("function")
    for (const id of Object.keys(ADAPTERS)) {
      expect(adapters[id]).toBe(ADAPTERS[id])
    }
  })
})
