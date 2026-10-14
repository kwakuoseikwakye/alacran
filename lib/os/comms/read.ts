import path from "node:path"
import { readdir } from "node:fs/promises"

export type CommsEntry = {
  id: string
  source: "messages" | "email" | "notion"
  date: string
  title: string
  path: string
}

const LANES: { dir: string; source: CommsEntry["source"] }[] = [
  { dir: "messages", source: "messages" },
  { dir: "email-checks", source: "email" },
  { dir: "notion-checks", source: "notion" },
]

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/

/**
 * Reads what the /check-* sweeps already wrote. Strictly read-only, and there
 * is deliberately no write path here at all: AGENTS.md §7 and the Publication
 * gate row mean this surface never sends, replies, marks read, or archives.
 *
 * A missing lane directory is normal — a company that has never run
 * /check-notion has no notion-checks/ — and is not an error.
 */
export async function readComms(
  companyRoot: string,
  listFn: (dir: string) => Promise<string[]> = (d) => readdir(d)
): Promise<CommsEntry[]> {
  const lanes = await Promise.all(
    LANES.map(async ({ dir, source }) => {
      const full = path.join(companyRoot, "notes", "company", dir)
      let names: string[]
      try {
        names = await listFn(full)
      } catch {
        return []
      }
      return names.flatMap((name) => {
        const match = DATE_PREFIX.exec(name)
        if (!match) return []
        return [{
          id: `${source}:${name}`,
          source,
          date: match[1],
          title: name.replace(/\.md$/, ""),
          path: path.join("notes", "company", dir, name),
        }]
      })
    })
  )

  return lanes.flat().sort((a, b) => b.date.localeCompare(a.date))
}
