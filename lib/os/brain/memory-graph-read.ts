import path from "node:path"
import { defaultExecFile } from "@/lib/default-exec-file"
import type { ExecFileFn } from "@/lib/git-commit-file"
import { readMemoryText, type MemoryKind } from "@/lib/os/memory-items"
import { readSkillsCatalog } from "@/lib/os/skills/catalog"
import { buildMemoryGraph, typeOfPath, type GraphFile, type GraphSkill } from "./memory-graph"
import type { MemoryGraph } from "./memory-graph-types"

const LISTED = ["AGENTS.md", "CLAUDE.md", "HANDOFF.md", "definitions", "notes", "docs/decisions"]
const KIND: Record<"session" | "note" | "decision" | "fact", MemoryKind> = { session: "note", note: "note", decision: "decision", fact: "fact" }

/**
 * The company's memory map, from committed content only: files come from
 * `git ls-files` and are read at HEAD, so a draft nobody approved is never a
 * node. A git failure gives an empty graph rather than an error.
 */
export async function readMemoryGraph(
  rootPath: string,
  companyName: string,
  opts: { execFn?: ExecFileFn; readSkills?: typeof readSkillsCatalog } = {}
): Promise<MemoryGraph> {
  const { execFn = defaultExecFile, readSkills = readSkillsCatalog } = opts
  const git = (args: string[]) => execFn("git", ["-C", rootPath, "-c", "core.quotepath=false", ...args])
  // A file that is listed but not committed yet fails here: it is not memory yet.
  const show = async (rel: string) => {
    try {
      return (await git(["show", `HEAD:./${rel}`])).stdout
    } catch {
      return null
    }
  }

  let listed: string[]
  try {
    listed = (await git(["ls-files", "--", ...LISTED])).stdout.split("\n").map((s) => s.trim()).filter(Boolean)
  } catch {
    return buildMemoryGraph({ files: [], skills: [] })
  }

  const files = (
    await Promise.all(
      listed.map(async (rel): Promise<GraphFile | null> => {
        const type = typeOfPath(rel)
        if (!type) return null
        const text = await show(rel)
        if (text === null) return null
        const { title, statement } = readMemoryText(rel, KIND[type as keyof typeof KIND], text)
        return { path: rel, text, title, summary: statement }
      })
    )
  ).filter((f): f is GraphFile => f !== null)

  let catalog: Awaited<ReturnType<typeof readSkillsCatalog>> = []
  try {
    catalog = await readSkills(rootPath, companyName)
  } catch {
    // no skills is a smaller map, not a broken one
  }
  const skills = await Promise.all(
    catalog
      .filter((s) => s.provenance !== "global")
      .map(async (s): Promise<GraphSkill> => {
        // Pack skills carry absolute paths; only a file inside the company folder is committed content.
        const rel = path.isAbsolute(s.filePath) ? path.relative(rootPath, s.filePath) : s.filePath
        const inside = !rel.startsWith("..") && !path.isAbsolute(rel)
        const text = inside ? ((await show(rel)) ?? "") : ""
        return { id: s.id, name: s.name, description: s.description, filePath: inside ? rel : s.filePath, text }
      })
  )

  return buildMemoryGraph({ files, skills })
}
