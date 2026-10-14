import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

export type DefinitionsNode =
  | { name: string; path: string; kind: "dir"; children: DefinitionsNode[] }
  | { name: string; path: string; kind: "file"; content: string }

type DirEntry = { name: string; isDirectory: () => boolean }
type ReadDirFn = (dir: string) => Promise<DirEntry[]>
type ReadFileFn = (file: string) => Promise<string>

const defaultReadDir: ReadDirFn = (dir) => readdir(dir, { withFileTypes: true })
const defaultReadFile: ReadFileFn = (file) => readFile(file, "utf-8")

// A YAML ontology file is a few KB; this is a guard against surprises, not a
// real limit anyone should hit reading definitions/.
const MAX_BYTES = 200_000

/**
 * A read-only rendering of `definitions/` — "so there is always a way to see
 * the actual bytes" (spec). There is deliberately no write path anywhere in
 * this module: promoting a claim (Task 12) is the one place this release
 * writes to a company folder, and it is not this one.
 *
 * A missing `definitions/` (no /define-company yet) is normal, not an error —
 * it renders as an empty tree.
 */
export async function readDefinitionsTree(
  companyRoot: string,
  readDirFn: ReadDirFn = defaultReadDir,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<DefinitionsNode[]> {
  return walk(path.join(companyRoot, "definitions"), "definitions", readDirFn, readFileFn)
}

async function walk(
  absDir: string,
  relDir: string,
  readDirFn: ReadDirFn,
  readFileFn: ReadFileFn
): Promise<DefinitionsNode[]> {
  let entries: DirEntry[]
  try {
    entries = await readDirFn(absDir)
  } catch {
    return []
  }

  const sorted = entries.filter((e) => !e.name.startsWith(".")).sort((a, b) => a.name.localeCompare(b.name))

  return Promise.all(
    sorted.map(async (e): Promise<DefinitionsNode> => {
      const rel = path.join(relDir, e.name)
      const abs = path.join(absDir, e.name)
      if (e.isDirectory()) {
        return { name: e.name, path: rel, kind: "dir", children: await walk(abs, rel, readDirFn, readFileFn) }
      }
      let content: string
      try {
        const raw = await readFileFn(abs)
        content = raw.length > MAX_BYTES ? `${raw.slice(0, MAX_BYTES)}\n…(truncated)` : raw
      } catch {
        content = ""
      }
      return { name: e.name, path: rel, kind: "file", content }
    })
  )
}
