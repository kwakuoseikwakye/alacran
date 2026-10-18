import { describe, expect, it } from "vitest"
import { buildMemoryGraph, typeOfPath, type GraphFile, type GraphSkill } from "./memory-graph"

const f = (path: string, text = "", title = path): GraphFile => ({ path, text, title, summary: "" })
const skill = (id: string, text = "", filePath = `.claude/commands/${id}.md`): GraphSkill => ({
  id,
  name: id,
  description: `does ${id}`,
  filePath,
  text,
})
const YAML = "definitions/ontology/company.yaml"

describe("typeOfPath", () => {
  it("classifies paths", () => {
    expect(typeOfPath("notes/company/sessions/a.md")).toBe("session")
    expect(typeOfPath("notes/x/y.md")).toBe("note")
    expect(typeOfPath("HANDOFF.md")).toBe("note")
    expect(typeOfPath("docs/decisions/2026-01-01-a.md")).toBe("decision")
    expect(typeOfPath("docs/decisions/README.md")).toBeNull()
    expect(typeOfPath("definitions/ontology/company.yaml")).toBe("fact")
    expect(typeOfPath("AGENTS.md")).toBe("fact")
    expect(typeOfPath("scripts/verify.py")).toBeNull()
  })
})

describe("buildMemoryGraph", () => {
  it("AGENTS.md, CLAUDE.md, company.yaml, HANDOFF.md are always; other files and every skill are lookup", () => {
    const g = buildMemoryGraph({
      files: [f("AGENTS.md"), f("CLAUDE.md"), f(YAML), f("HANDOFF.md"), f("notes/a.md"), f("definitions/b.md")],
      skills: [skill("verify")],
    })
    const state = (id: string) => g.nodes.find((n) => n.id === id)?.state
    for (const p of ["AGENTS.md", "CLAUDE.md", YAML, "HANDOFF.md"]) expect(state(p)).toBe("always")
    expect(state("notes/a.md")).toBe("lookup")
    expect(state("definitions/b.md")).toBe("lookup")
    expect(state("skill:verify")).toBe("lookup")
  })

  it("company.yaml items become nodes linked to company.yaml; an unsure item is unsure even though its file is always", () => {
    const yaml = ["name: Acme", "pricing: <<TODO>>", ""].join("\n")
    const g = buildMemoryGraph({ files: [{ ...f(YAML), text: yaml }], skills: [] })
    expect(g.nodes.find((n) => n.id === YAML)?.state).toBe("always")
    const items = g.nodes.filter((n) => n.id.startsWith("yaml:"))
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items.every((n) => n.type === "fact" && n.path === YAML)).toBe(true)
    const pricing = items.find((n) => n.id === "yaml:pricing")
    expect(pricing?.state).toBe("unsure")
    expect(items.find((n) => n.id === "yaml:name")?.state).toBe("always")
    for (const n of items) {
      expect(g.edges.some((e) => (e.source === YAML && e.target === n.id) || (e.target === YAML && e.source === n.id))).toBe(true)
    }
  })

  it("counts: alwaysFiles counts always FILES only, lookupFiles counts lookup file and skill nodes, unsureFacts counts unsure items", () => {
    const g = buildMemoryGraph({
      files: [
        f("AGENTS.md"),
        { ...f(YAML), text: "name: Acme\npricing: <<TODO>>\n" },
        f("notes/a.md"),
        f("notes/b.md"),
        f("docs/decisions/d.md"),
      ],
      skills: [skill("verify")],
    })
    expect(g.counts).toEqual({ alwaysFiles: 2, lookupFiles: 4, unsureFacts: 1 })
  })

  it("every session links to hub:sessions, not to AGENTS.md", () => {
    const g = buildMemoryGraph({
      files: [f("AGENTS.md"), f("notes/company/sessions/s1.md"), f("notes/c.md")],
      skills: [],
    })
    const touching = (id: string) =>
      g.edges.filter((e) => e.source === id || e.target === id).map((e) => (e.source === id ? e.target : e.source))
    expect(touching("notes/company/sessions/s1.md")).toEqual(["hub:sessions"])
    expect(touching("notes/c.md")).toEqual(["hub:notes"])
    expect(touching("AGENTS.md")).toEqual([])
    expect(g.nodes.find((n) => n.id === "hub:sessions")).toMatchObject({ type: "hub", label: "Sessions" })
  })

  it("a hub exists only when it has a file", () => {
    const g = buildMemoryGraph({ files: [f("notes/a.md")], skills: [] })
    expect(g.nodes.filter((n) => n.type === "hub").map((n) => n.id)).toEqual(["hub:notes"])
  })

  it("edges are undirected-unique: a→b and b→a appear once", () => {
    const g = buildMemoryGraph({
      files: [f("notes/a.md", "see notes/b.md"), f("notes/b.md", "see notes/a.md")],
      skills: [],
    })
    const between = g.edges.filter((e) => [e.source, e.target].sort().join() === "notes/a.md,notes/b.md")
    expect(between).toHaveLength(1)
  })

  it("skills link out via their text, labelled /id under .claude/commands/", () => {
    const g = buildMemoryGraph({
      files: [f("notes/a.md")],
      skills: [skill("verify", "writes notes/a.md"), skill("odd", "", ".claude/skills/odd/SKILL.md")],
    })
    expect(g.nodes.find((n) => n.id === "skill:verify")).toMatchObject({ label: "/verify", path: ".claude/commands/verify.md", summary: "does verify" })
    expect(g.nodes.find((n) => n.id === "skill:odd")?.label).toBe("odd")
    expect(g.edges).toContainEqual({ source: "skill:verify", target: "notes/a.md" })
  })

  it("drops edges whose endpoint is not a node", () => {
    const g = buildMemoryGraph({ files: [f("notes/a.md", "see notes/missing.md and /nope")], skills: [] })
    const ids = new Set(g.nodes.map((n) => n.id))
    expect(g.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true)
  })

  it("empty input gives an empty graph with zero counts", () => {
    expect(buildMemoryGraph({ files: [], skills: [] })).toEqual({
      nodes: [],
      edges: [],
      counts: { alwaysFiles: 0, lookupFiles: 0, unsureFacts: 0 },
    })
  })
})
