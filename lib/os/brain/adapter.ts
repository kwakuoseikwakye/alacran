import fs from "node:fs"
import path from "node:path"
import type { KnowledgeGraph, KGNode } from "./knowledge-graph"
import { buildKnowledgeGraph, SELF_ID } from "./knowledge-graph"
import { demoMemoryGraph, type MemoryGraph, type MemoryNode, type MemoryEdge } from "./memory-core"
import type { Agent, Department, Person, SopTask, RosterClient, AgentRun } from "./types"
import type { DefinitionsNode } from "./definitions-files"
import {
  CANONICAL_DEPARTMENTS,
  CANONICAL_AGENTS,
  CANONICAL_PEOPLE,
  CANONICAL_SOP_TASKS,
  CANONICAL_RUNS,
} from "./canonical"
import type { FunnelJourney } from "@/lib/os/departments/adapters/funnel-adapter"
import { getSeedFunnelJourneys } from "@/lib/os/funnel/seed"

import { getCompanyDepartments } from "@/lib/os/departments/registry"

export type DecisionDigestItem = {
  slug: string
  title: string
  companyId?: string
  companyName?: string
  date?: string
  summary?: string
}

export type RecordFileNode = {
  name: string
  path: string
  kind?: "file" | "dir"
  content?: string
}

export type BrainViewModel = {
  graph: KnowledgeGraph
  agents: Agent[]
  departments: Department[]
  people: Person[]
  tasks: SopTask[]
  memory: MemoryGraph
  clients: RosterClient[]
  runsByAgent: Record<string, AgentRun>
}

export type BrainViewModelInput = {
  companyRoot?: string
  operatorName?: string
  agents?: Agent[]
  departments?: Department[]
  people?: Person[]
  tasks?: SopTask[]
  journeys?: FunnelJourney[]
  definitionsNodes?: DefinitionsNode[]
  decisions?: DecisionDigestItem[]
  records?: RecordFileNode[]
}

function flattenDefinitions(nodes: DefinitionsNode[]): Array<{ name: string; path: string; content: string }> {
  const result: Array<{ name: string; path: string; content: string }> = []
  for (const n of nodes) {
    if (n.kind === "file") {
      result.push({ name: n.name, path: n.path, content: n.content })
    } else if (n.kind === "dir" && n.children) {
      result.push(...flattenDefinitions(n.children))
    }
  }
  return result
}

function readFilesSync(dir: string, baseDir: string = dir): Array<{ name: string; path: string; content: string }> {
  if (!fs.existsSync(dir)) return []
  const results: Array<{ name: string; path: string; content: string }> = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith(".")) continue
      const fullPath = path.join(dir, e.name)
      if (e.isDirectory()) {
        results.push(...readFilesSync(fullPath, baseDir))
      } else if (e.isFile()) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8")
          results.push({
            name: e.name,
            path: path.relative(baseDir, fullPath),
            content: content.slice(0, 5000),
          })
        } catch {
          // Ignore read error
        }
      }
    }
  } catch {
    return []
  }
  return results
}

function readDecisionsSync(docsDir: string): DecisionDigestItem[] {
  const decisionsDir = path.join(docsDir, "decisions")
  if (!fs.existsSync(decisionsDir)) return []
  const items: DecisionDigestItem[] = []
  try {
    const files = fs.readdirSync(decisionsDir)
    for (const file of files) {
      if (!file.endsWith(".md") || file.toLowerCase().startsWith("readme")) continue
      const fullPath = path.join(decisionsDir, file)
      try {
        const content = fs.readFileSync(fullPath, "utf-8")
        const slug = file.replace(/\.md$/, "")
        const titleMatch = content.match(/^#\s+(?:Decision:\s*)?(.*)$/m)
        const title = titleMatch ? titleMatch[1].trim() : slug
        const decisionMatch = content.match(/##\s+(?:Decision|What We Did)[\s\S]*?\n([^\n#]+)/i)
        const summary = decisionMatch ? decisionMatch[1].trim().replace(/\s+/g, " ") : undefined
        items.push({
          slug,
          title,
          summary: summary ? summary.slice(0, 150) : undefined,
        })
      } catch {
        // Skip
      }
    }
  } catch {
    return []
  }
  return items
}

const rnd = (s: string, i: number): number => {
  let h = 2166136261 ^ i
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

function buildRealMemoryGraph(
  definitions: Array<{ name: string; path: string; content: string }>,
  decisions: DecisionDigestItem[],
  records: RecordFileNode[],
  notes: Array<{ name: string; path: string; content: string }>
): MemoryGraph {
  const categories: Array<{
    folder: string
    items: Array<{ id: string; label: string; excerpt: string; wordCount: number }>
  }> = []

  if (definitions.length > 0) {
    categories.push({
      folder: "Definitions",
      items: definitions.map((d) => ({
        id: `page:definitions/${d.path}`,
        label: d.name,
        excerpt: d.content ? d.content.slice(0, 150) : d.name,
        wordCount: d.content ? d.content.split(/\s+/).length : 50,
      })),
    })
  }

  if (decisions.length > 0) {
    categories.push({
      folder: "Decisions",
      items: decisions.map((d) => ({
        id: `page:decisions/${d.slug}`,
        label: d.title,
        excerpt: d.summary || d.title,
        wordCount: 100,
      })),
    })
  }

  if (records.length > 0) {
    categories.push({
      folder: "Records",
      items: records.map((r) => ({
        id: `page:records/${r.path}`,
        label: r.name,
        excerpt: r.content ? r.content.slice(0, 150) : r.name,
        wordCount: 50,
      })),
    })
  }

  if (notes.length > 0) {
    categories.push({
      folder: "Notes",
      items: notes.map((n) => ({
        id: `page:notes/${n.path}`,
        label: n.name,
        excerpt: n.content ? n.content.slice(0, 150) : n.name,
        wordCount: n.content ? n.content.split(/\s+/).length : 30,
      })),
    })
  }

  if (categories.length === 0) {
    return demoMemoryGraph()
  }

  const nodes: MemoryNode[] = []
  const edges: MemoryEdge[] = []

  categories.forEach((cat, ci) => {
    nodes.push({
      id: `folder:${cat.folder}`,
      type: "folder",
      label: cat.folder,
      folder: cat.folder,
      excerpt: `${cat.folder} in knowledge core`,
      wordCount: 0,
      chunks: 0,
      vx: (rnd(cat.folder, 8) - 0.5) * 0.4,
      vy: (rnd(cat.folder, 9) - 0.5) * 0.4,
      cluster: ci,
      links: cat.items.length,
    })

    cat.items.forEach((item) => {
      nodes.push({
        id: item.id,
        type: "page",
        label: item.label,
        folder: cat.folder,
        excerpt: item.excerpt,
        wordCount: item.wordCount,
        chunks: 1,
        vx: (rnd(item.id, 3) - 0.5) * 0.6,
        vy: (rnd(item.id, 4) - 0.5) * 0.6,
        cluster: ci,
        links: 1,
      })
      edges.push({
        source: `folder:${cat.folder}`,
        target: item.id,
        type: "member",
      })
    })
  })

  // Cross links between adjacent pages
  const pages = nodes.filter((n) => n.type === "page")
  pages.forEach((p, idx) => {
    if (idx > 0 && idx % 3 === 0) {
      const prev = pages[idx - 1]
      edges.push({
        source: p.id,
        target: prev.id,
        type: "wikilink",
      })
      p.links += 1
      prev.links += 1
    }
  })

  return { nodes, edges }
}

export function buildBrainViewModel(input: BrainViewModelInput = {}): BrainViewModel {
  // Use company-specific entities if present, otherwise discover or fall back cleanly
  const departments =
    input.departments && input.departments.length > 0
      ? input.departments
      : input.companyRoot
      ? getCompanyDepartments(input.companyRoot)
      : CANONICAL_DEPARTMENTS

  const agents =
    input.agents !== undefined
      ? input.agents
      : input.companyRoot
      ? []
      : CANONICAL_AGENTS

  const people =
    input.people !== undefined
      ? input.people
      : input.companyRoot
      ? []
      : CANONICAL_PEOPLE

  const tasks =
    input.tasks !== undefined
      ? input.tasks
      : input.companyRoot
      ? []
      : CANONICAL_SOP_TASKS

  const journeys =
    input.journeys && input.journeys.length > 0
      ? input.journeys
      : input.companyRoot
      ? []
      : getSeedFunnelJourneys()

  const clients: RosterClient[] = journeys.map((j) => ({
    id: j.id,
    name: j.name,
    venture: j.venture ?? "all",
    status: j.status,
    amountUsd: j.amountUsd,
    source: "funnel",
  }))

  const operatorName = input.operatorName || (input.companyRoot ? "Operator" : "Alex")
  const knowledgeGraph = buildKnowledgeGraph(agents, departments, people, tasks, [], operatorName)

  // 1. Resolve Definitions
  let definitionFiles: Array<{ name: string; path: string; content: string }> = []
  if (input.definitionsNodes && input.definitionsNodes.length > 0) {
    definitionFiles = flattenDefinitions(input.definitionsNodes)
  } else if (input.companyRoot) {
    const defDir = path.join(input.companyRoot, "definitions")
    definitionFiles = readFilesSync(defDir, input.companyRoot)
  }

  // 2. Resolve Decisions
  let decisions: DecisionDigestItem[] = []
  if (input.decisions && input.decisions.length > 0) {
    decisions = input.decisions
  } else if (input.companyRoot) {
    decisions = readDecisionsSync(path.join(input.companyRoot, "docs"))
  }

  // 3. Resolve Records
  let records: RecordFileNode[] = []
  if (input.records && input.records.length > 0) {
    records = input.records
  } else if (input.companyRoot) {
    const recordsDir = path.join(input.companyRoot, "records")
    records = readFilesSync(recordsDir, input.companyRoot).map((f) => ({
      name: f.name,
      path: f.path,
      content: f.content,
    }))
  }

  // 4. Resolve Notes
  let notes: Array<{ name: string; path: string; content: string }> = []
  if (input.companyRoot) {
    const notesDir = path.join(input.companyRoot, "notes")
    notes = readFilesSync(notesDir, input.companyRoot)
  }

  // Ground knowledge graph nodes with real files
  for (const def of definitionFiles) {
    const nodeId = `def:${def.path}`
    const node: KGNode = {
      id: nodeId,
      kind: "definition",
      label: def.name,
      ring: 2,
      color: "var(--accent)",
      path: def.path,
      content: def.content,
      summary: def.content ? def.content.slice(0, 150).trim() : undefined,
    }
    knowledgeGraph.nodes.push(node)

    // Match with department if applicable, otherwise connect to core
    const matchedDept = departments.find(
      (d) =>
        def.path.toLowerCase().includes(d.id.replace("dept-", "")) ||
        (d.slug && def.path.toLowerCase().includes(d.slug)) ||
        (def.content && def.content.toLowerCase().includes(d.name.toLowerCase()))
    )
    knowledgeGraph.edges.push({
      source: matchedDept ? `team:${matchedDept.id}` : SELF_ID,
      target: nodeId,
      kind: "sop",
    })
  }

  for (const dec of decisions) {
    const nodeId = `decision:${dec.slug}`
    const node: KGNode = {
      id: nodeId,
      kind: "decision",
      label: dec.title || dec.slug,
      ring: 2,
      color: "var(--kg-person, var(--warn))",
      path: `docs/decisions/${dec.slug}.md`,
      summary: dec.summary,
    }
    knowledgeGraph.nodes.push(node)
    knowledgeGraph.edges.push({
      source: SELF_ID,
      target: nodeId,
      kind: "sop",
    })
  }

  for (const rec of records) {
    const nodeId = `record:${rec.path}`
    const node: KGNode = {
      id: nodeId,
      kind: "record",
      label: rec.name,
      ring: 2,
      color: "var(--kg-tool, #06b6d4)",
      path: rec.path,
      content: rec.content,
      summary: rec.content ? rec.content.slice(0, 150).trim() : undefined,
    }
    knowledgeGraph.nodes.push(node)

    // Match with department if applicable, otherwise connect to core
    const matchedDept = departments.find(
      (d) =>
        (d.slug && rec.path.toLowerCase().includes(d.slug.toLowerCase())) ||
        rec.path.toLowerCase().includes(d.id.replace("dept-", "").toLowerCase())
    )
    knowledgeGraph.edges.push({
      source: matchedDept ? `team:${matchedDept.id}` : SELF_ID,
      target: nodeId,
      kind: "sop",
    })
  }

  for (const n of notes) {
    const nodeId = `note:${n.path}`
    const node: KGNode = {
      id: nodeId,
      kind: "note",
      label: n.name,
      ring: 2,
      color: "var(--muted)",
      path: n.path,
      content: n.content,
      summary: n.content ? n.content.slice(0, 150).trim() : undefined,
    }
    knowledgeGraph.nodes.push(node)
    knowledgeGraph.edges.push({
      source: SELF_ID,
      target: nodeId,
      kind: "sop",
    })
  }

  const memory = buildRealMemoryGraph(definitionFiles, decisions, records, notes)

  return {
    graph: knowledgeGraph,
    agents,
    departments,
    people,
    tasks,
    memory,
    clients,
    runsByAgent: input.companyRoot ? {} : CANONICAL_RUNS,
  }
}
