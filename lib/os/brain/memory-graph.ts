import { readCompanyFacts } from "./company-facts"
import type { MemoryEdge, MemoryGraph, MemoryNode, MemoryNodeType } from "./memory-graph-types"
import { buildLinkIndex, extractLinks } from "./memory-links"
import { HUB_FOLDERS, hubOf } from "./memory-hubs"

export { HUB_FOLDERS, hubOf }

export type GraphFile = { path: string; text: string; title: string; summary: string }
export type GraphSkill = { id: string; name: string; description: string; filePath: string; text: string }

export const ALWAYS_PATHS = ["AGENTS.md", "CLAUDE.md", "definitions/ontology/company.yaml", "HANDOFF.md"] as const

const HUB_LABELS: Record<string, string> = {
  "hub:facts": "Facts",
  "hub:decisions": "Decisions",
  "hub:notes": "Notes",
  "hub:sessions": "Sessions",
}

const COMPANY_YAML = "definitions/ontology/company.yaml"

export function typeOfPath(path: string): MemoryNodeType | null {
  if (/^notes\/company\/sessions\/[^/]+\.md$/.test(path)) return "session"
  if (path.startsWith("notes/") || path === "HANDOFF.md") return "note"
  if (/^docs\/decisions\/[^/]+\.md$/.test(path) && path !== "docs/decisions/README.md") return "decision"
  if (path.startsWith("definitions/") || path === "AGENTS.md" || path === "CLAUDE.md") return "fact"
  return null
}

export function buildMemoryGraph(input: { files: GraphFile[]; skills: GraphSkill[] }): MemoryGraph {
  const always = new Set<string>(ALWAYS_PATHS)
  const nodes: MemoryNode[] = []
  const edges: MemoryEdge[] = []
  const typed = input.files.filter((f) => typeOfPath(f.path) !== null)

  for (const file of typed) {
    nodes.push({
      id: file.path,
      type: typeOfPath(file.path)!,
      label: file.title,
      path: file.path,
      summary: file.summary,
      state: always.has(file.path) ? "always" : "lookup",
    })
  }

  const skillNodeId = (id: string) => `skill:${id}`
  for (const s of input.skills) {
    nodes.push({
      id: skillNodeId(s.id),
      type: "skill",
      label: s.filePath.startsWith(".claude/commands/") ? `/${s.id}` : s.name,
      path: s.filePath,
      summary: s.description,
      state: "lookup",
    })
  }

  const usedHubs = new Set<string>()
  for (const file of typed) {
    const hub = hubOf(file.path)
    if (!hub) continue
    usedHubs.add(hub)
    edges.push({ source: file.path, target: hub })
  }
  for (const hub of Object.values(HUB_FOLDERS)) {
    if (usedHubs.has(hub)) {
      nodes.push({ id: hub, type: "hub", label: HUB_LABELS[hub], path: "", summary: "", state: "lookup" })
    }
  }

  const index = buildLinkIndex(
    typed.map((f) => f.path),
    input.skills.map((s) => ({ id: s.id, nodeId: skillNodeId(s.id) })),
    HUB_FOLDERS,
  )
  for (const file of typed) {
    for (const t of extractLinks(file.text, index, file.path)) edges.push({ source: file.path, target: t })
  }
  for (const s of input.skills) {
    const self = skillNodeId(s.id)
    for (const t of extractLinks(s.text, index, self)) edges.push({ source: self, target: t })
  }

  let unsureFacts = 0
  const yaml = typed.find((f) => f.path === COMPANY_YAML)
  if (yaml) {
    for (const fact of readCompanyFacts(yaml.text)) {
      if (fact.unsure) unsureFacts++
      nodes.push({
        id: fact.id,
        type: "fact",
        label: fact.label,
        path: COMPANY_YAML,
        summary: fact.summary,
        state: fact.unsure ? "unsure" : "always",
      })
      edges.push({ source: COMPANY_YAML, target: fact.id })
    }
  }

  const ids = new Set(nodes.map((n) => n.id))
  const seen = new Set<string>()
  const kept = edges.filter((e) => {
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target)) return false
    const key = e.source < e.target ? `${e.source}\0${e.target}` : `${e.target}\0${e.source}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const fileNodes = nodes.filter((n) => n.type !== "hub" && !n.id.startsWith("yaml:"))
  return {
    nodes,
    edges: kept,
    counts: {
      alwaysFiles: fileNodes.filter((n) => n.state === "always").length,
      lookupFiles: fileNodes.filter((n) => n.state === "lookup").length,
      unsureFacts,
    },
  }
}
