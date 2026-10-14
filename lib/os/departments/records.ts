import fs from "node:fs/promises"
import path from "node:path"
import yaml from "yaml"
import { contained } from "./safety"
import { SLUG_PATTERN } from "./rules"

export type DepartmentRecord = { file: string; title: string; updated: string; kind: "markdown" | "other" }

const MAX_READ = 64 * 1024
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function parse(text: string): { title?: string; updated?: string; body: string } {
  const m = text.match(FRONT)
  if (!m) return { body: text.trim() }
  let meta: unknown
  try { meta = yaml.parse(m[1]) } catch { meta = null }
  const o = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    updated: typeof o.updated === "string" ? o.updated : o.updated instanceof Date ? o.updated.toISOString() : undefined,
    body: text.slice(m[0].length).trim(),
  }
}

async function folderOf(root: string, slug: string): Promise<string | null> {
  if (!SLUG_PATTERN.test(slug)) return null
  const folder = path.join(root, "records", slug)
  return (await contained(root, folder)) ? folder : null
}

export async function listDepartmentRecords(root: string, slug: string): Promise<DepartmentRecord[]> {
  const folder = await folderOf(root, slug)
  if (!folder) return []
  let entries
  try { entries = await fs.readdir(folder, { withFileTypes: true }) } catch { return [] }
  const out: DepartmentRecord[] = []
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith(".")) continue
    try { // a file removed between readdir and here is skipped, not fatal
      const full = path.join(folder, e.name)
      const stat = await fs.stat(full)
      if (!e.name.endsWith(".md")) {
        out.push({ file: e.name, title: e.name, updated: stat.mtime.toISOString(), kind: "other" })
        continue
      }
      const head = (await fs.readFile(full, "utf8")).slice(0, MAX_READ)
      const meta = parse(head)
      out.push({ file: e.name, title: meta.title ?? e.name, updated: meta.updated ?? stat.mtime.toISOString(), kind: "markdown" })
    } catch { /* skip */ }
  }
  return out.sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated) || a.file.localeCompare(b.file))
}

export async function readDepartmentRecord(root: string, slug: string, file: string): Promise<{ title: string; updated: string; body: string } | null> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(file)) return null
  const folder = await folderOf(root, slug)
  if (!folder) return null
  try {
    const full = path.join(folder, file)
    if (!(await contained(root, full))) return null
    const [text, stat] = await Promise.all([fs.readFile(full, "utf8"), fs.stat(full)])
    const meta = parse(text.slice(0, MAX_READ * 4))
    return { title: meta.title ?? file, updated: meta.updated ?? stat.mtime.toISOString(), body: meta.body }
  } catch {
    return null
  }
}
