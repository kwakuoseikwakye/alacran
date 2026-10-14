import { describe, it, expect } from "vitest"
import { buildLifecycle } from "./lifecycle"
import type { Ontology } from "../ontology/schema"

const ontology: Ontology = {
  customer: { segments: [{ id: "smb", name: "Small business owners" }], acquisition: [] },
  org: { roles: [{ id: "lead", name: "Technical Lead" }], decisions: [] },
  product: { offerings: [{ id: "desktop", name: "Desktop app" }], value_flow: [] },
} as Ontology

const input = {
  sources: ["notes/company/messages/2026-09-08.md"],
  signals: ["notes/company/digests/2026-09-07-digest.md"],
  claims: [
    { agentId: "acme", commandId: "refresh", touchesDefinitions: true },
    { agentId: "acme", commandId: "daily-team-log", touchesDefinitions: false },
  ],
  ontology,
  memories: ["docs/decisions/2026-09-06-releases-repo-token-scope.md"],
}

describe("buildLifecycle", () => {
  it("puts every stage in the result even when empty", () => {
    const result = buildLifecycle({ ...input, sources: [], signals: [], claims: [], ontology: null, memories: [] })
    expect(Object.keys(result).sort()).toEqual(["claim", "fact", "memory", "signal", "source"])
    expect(result.source).toEqual([])
  })

  it("counts only reviews that touch definitions as claims", () => {
    const result = buildLifecycle(input)
    expect(result.claim).toHaveLength(1)
    expect(result.claim[0].id).toBe("claim:acme:refresh")
  })

  it("derives facts from the ontology's entities", () => {
    const result = buildLifecycle(input)
    const labels = result.fact.map((c) => c.label)
    expect(labels).toContain("Small business owners")
    expect(labels).toContain("Technical Lead")
    expect(labels).toContain("Desktop app")
  })

  it("has no facts when there is no ontology", () => {
    expect(buildLifecycle({ ...input, ontology: null }).fact).toEqual([])
  })

  it("labels a card by basename, not full path", () => {
    const result = buildLifecycle(input)
    expect(result.source[0].label).toBe("2026-09-08.md")
    expect(result.source[0].detail).toBe("notes/company/messages/2026-09-08.md")
  })

  it("emits unique ids across every stage", () => {
    const result = buildLifecycle(input)
    const ids = Object.values(result).flat().map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
