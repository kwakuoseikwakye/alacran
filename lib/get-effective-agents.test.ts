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
    const { genericGitLogActivityAdapter } = await import("./adapters/generic-git-log")

    const adapters = await getEffectiveAdapters()

    expect(adapters["second-co"]).toBe(genericGitLogActivityAdapter)
    for (const id of Object.keys(ADAPTERS)) {
      expect(adapters[id]).toBe(ADAPTERS[id])
    }
  })

  it("drops a registered company whose id collides with a static agent id, instead of overwriting it", async () => {
    // ./config's AGENTS/ADAPTERS/SKILL_ADAPTERS are existence-gated against
    // real ~/AI-Native/* directories (see lib/builtin-agents.ts) — this test
    // needs a REAL static "static-ops" entry to collide with, so it must mock
    // ./config explicitly rather than assume one exists on whatever machine
    // happens to be running the suite (true on this repo's own dev machine,
    // false on a clean checkout/CI runner).
    const realStatic = { id: "static-ops", name: "Static Ops", rootPath: "/real/static-ops", kind: "report-log" as const }
    const realAdapter = async () => []
    const realSkillAdapter = async () => []
    vi.doMock("./config", () => ({
      AGENTS: [realStatic],
      ADAPTERS: { "static-ops": realAdapter },
      SKILL_ADAPTERS: { "static-ops": realSkillAdapter },
    }))
    vi.doMock("./companies-registry", () => ({
      getRegisteredCompanies: async () => [
        { id: "static-ops", name: "Imposter Ops", rootPath: "/fake/imposter" },
      ],
    }))
    const { getEffectiveAgents, getEffectiveAdapters, getEffectiveSkillAdapters } = await import(
      "./get-effective-agents"
    )
    const { AGENTS, ADAPTERS, SKILL_ADAPTERS } = await import("./config")

    const agents = await getEffectiveAgents()
    const matching = agents.filter((a) => a.id === "static-ops")
    expect(matching).toHaveLength(1)
    expect(matching[0]).toEqual(AGENTS.find((a) => a.id === "static-ops"))
    expect(agents).toEqual(AGENTS)

    const adapters = await getEffectiveAdapters()
    expect(adapters["static-ops"]).toBe(ADAPTERS["static-ops"])

    const skillAdapters = await getEffectiveSkillAdapters()
    expect(skillAdapters["static-ops"]).toBe(SKILL_ADAPTERS["static-ops"])
  })
})
