import path from "node:path"
import { defaultExecFile } from "@/lib/default-exec-file"
import type { ExecFileFn } from "@/lib/git-commit-file"
import { readMemoryText, type MemoryKind } from "@/lib/os/memory-items"
import { readSkillsCatalog } from "@/lib/os/skills/catalog"
import { buildMemoryGraph, typeOfPath, type GraphFile, type GraphSkill } from "./memory-graph"
import type { MemoryGraph } from "./memory-graph-types"

const LISTED = ["AGENTS.md", "CLAUDE.md", "HANDOFF.md", "definitions", "notes", "docs/decisions"]
const KIND: Record<"session" | "note" | "decision" | "fact", MemoryKind> = { session: "note", note: "note", decision: "decision", fact: "fact" }

const CONCURRENCY = 8

const empty = (): MemoryGraph => ({ nodes: [], edges: [], counts: { alwaysFiles: 0, lookupFiles: 0, unsureFacts: 0 } })

// A page that auto-refreshes must not fork hundreds of git processes per render:
// a spawn failure would look the same as "not committed" and drop nodes.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// ponytail: keyed by root + HEAD sha, so the skills catalog (read from disk) is
// not re-read until the next commit, and entries are never evicted. Fine for a
// handful of companies; add eviction if one process serves many.
const cache = new Map<string, { sha: string; graph: MemoryGraph }>()
export function resetMemoryGraphCache() {
  cache.clear()
}

/**
 * The company's memory map, from committed content only: files come from
 * `git ls-files` and are read at HEAD, so a draft nobody approved is never a
 * node. A git or parse failure gives an empty graph rather than an error.
 */
export async function readMemoryGraph(
  rootPath: string,
  companyName: string,
  opts: { execFn?: ExecFileFn; readSkills?: typeof readSkillsCatalog } = {}
): Promise<MemoryGraph> {
  const { execFn = defaultExecFile, readSkills = readSkillsCatalog } = opts
  const git = (args: string[]) => execFn("git", ["--no-optional-locks", "-C", rootPath, "-c", "core.quotepath=false", ...args])
  // A file that is listed but not committed yet fails here: it is not memory yet.
  const show = async (rel: string) => {
    try {
      return (await git(["show", `HEAD:./${rel}`])).stdout
    } catch {
      return null
    }
  }

  let listed: string[]
  let sha: string
  try {
    sha = (await git(["rev-parse", "HEAD"])).stdout.trim()
    const hit = cache.get(rootPath)
    if (hit && hit.sha === sha) return hit.graph
    listed = (await git(["ls-files", "--", ...LISTED])).stdout.split("\n").map((s) => s.trim()).filter(Boolean)
  } catch {
    return empty()
  }

  const files = (
    await mapLimit(listed, CONCURRENCY, async (rel): Promise<GraphFile | null> => {
      const type = typeOfPath(rel)
      if (!type) return null
      const text = await show(rel)
      if (text === null) return null
      try {
        const { title, statement } = readMemoryText(rel, KIND[type as keyof typeof KIND], text)
        return { path: rel, text, title, summary: statement }
      } catch {
        // one file that won't parse is a missing node, not a broken page
        return null
      }
    })
  ).filter((f): f is GraphFile => f !== null)

  let catalog: Awaited<ReturnType<typeof readSkillsCatalog>> = []
  try {
    catalog = await readSkills(rootPath, companyName)
  } catch {
    // no skills is a smaller map, not a broken one
  }
  const skills = await mapLimit(
    catalog.filter((s) => s.provenance !== "global"),
    CONCURRENCY,
    async (s): Promise<GraphSkill> => {
      // Pack skills carry absolute paths; only a file inside the company folder is committed content.
      const rel = path.isAbsolute(s.filePath) ? path.relative(rootPath, s.filePath) : s.filePath
      const inside = rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel)
      const text = inside ? ((await show(rel)) ?? "") : ""
      return { id: s.id, name: s.name, description: s.description, filePath: inside ? rel : s.filePath, text }
    }
  )

  let graph: MemoryGraph
  try {
    graph = buildMemoryGraph({ files, skills })
  } catch {
    // The page renders this; a throw here would be a 500 on every refresh. Not cached, so the next render retries.
    return empty()
  }
  cache.set(rootPath, { sha, graph })
  return graph
}
