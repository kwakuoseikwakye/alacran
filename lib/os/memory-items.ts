import path from "node:path"
import { defaultExecFile } from "@/lib/default-exec-file"
import { INITIAL_COMMIT_MESSAGE } from "@/lib/company-template-manifest"
import type { ExecFileFn } from "@/lib/git-commit-file"
import { memoizedReadFile } from "@/lib/os/file-memo"
import { describeProfile } from "@/lib/company-commands/profile-preview"

/**
 * What Alacrán knows, as plain items, for Home's card and the brain's list.
 *
 * Memory is the company's facts (definitions/), decisions (docs/decisions/) and
 * working notes (notes/). Only what is committed counts: the paths come from
 * `git log`, and a committed file with a pending edit is read as committed, so
 * a draft nobody approved is never shown as something Alacrán knows.
 */
export type MemoryKind = "fact" | "decision" | "note"
export type MemoryItem = {
  /** Repo-relative. */
  path: string
  kind: MemoryKind
  title: string
  /** One plain sentence, at most 140 characters; may be empty. */
  statement: string
  /** Unix seconds: git author date of the file's last change. */
  changedAt: number
}

const PROFILE_PATH = "definitions/ontology/company.yaml"
const MEMORY_PATHS = ["definitions", "notes", "docs/decisions"]
const REC = "\x1e"
const FLD = "\x1f"
const WEEK_SECONDS = 7 * 24 * 60 * 60
const MAX_STATEMENT = 140

export function kindOf(relPath: string): MemoryKind | null {
  if (!/\.(md|ya?ml)$/i.test(relPath)) return null
  if (relPath.startsWith("definitions/")) return "fact"
  if (relPath.startsWith("docs/decisions/")) return "decision"
  if (relPath.startsWith("notes/")) return "note"
  return null
}

const stemOf = (p: string) => (p.split("/").pop() ?? p).replace(/\.[^.]+$/, "")
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plainName = (stem: string) => capitalise(stem.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " "))
const clip = (s: string) => (s.length > MAX_STATEMENT ? `${s.slice(0, MAX_STATEMENT - 1)}…` : s)
const plain = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/^[-*]\s+/, "").trim()
const isHeading = (line: string) => /^#{1,6}\s/.test(line)

/** First paragraph at or after `from`, skipping blank lines and headings. */
function paragraphAfter(lines: string[], from: number): string {
  let i = from
  while (i < lines.length && (!lines[i].trim() || isHeading(lines[i]))) i++
  const para: string[] = []
  while (i < lines.length && lines[i].trim() && !isHeading(lines[i])) para.push(lines[i++].trim())
  return clip(plain(para.join(" ")))
}

// ponytail: line-based markdown, not a parser. A file with an unusual layout
// gets a weak statement; the title always falls back to the file name.
export function readMemoryText(relPath: string, kind: MemoryKind, raw: string): { title: string; statement: string } {
  if (relPath === PROFILE_PATH) {
    return { title: "Your company profile", statement: describeProfile(relPath, raw)?.split("\n")[0] ?? "" }
  }
  if (kind === "fact") return { title: plainName(stemOf(relPath)), statement: "" }
  const lines = raw.replace(/^---\n[\s\S]*?\n---\s*/, "").split("\n")
  const h1 = lines.findIndex((l) => /^#\s+\S/.test(l))
  const title = h1 >= 0 ? plain(lines[h1].replace(/^#\s+/, "")) : plainName(stemOf(relPath))
  const decisionAt = kind === "decision" ? lines.findIndex((l) => /^#{2,6}\s*decision\b/i.test(l)) : -1
  const from = decisionAt >= 0 ? decisionAt + 1 : h1 >= 0 ? h1 + 1 : 0
  return { title, statement: paragraphAfter(lines, from) }
}

// ponytail: the last `limit` file changes only (a very old fact can drop out of
// the list); deleted files are skipped; git quotes tab/quote/backslash names.
export async function listMemoryItems(
  rootPath: string,
  opts: { limit?: number; execFn?: ExecFileFn; readFn?: (absPath: string) => Promise<string> } = {}
): Promise<MemoryItem[]> {
  const { limit = 300, execFn = defaultExecFile, readFn = memoizedReadFile } = opts
  const git = (args: string[]) => execFn("git", ["-C", rootPath, "-c", "core.quotepath=false", ...args])

  let log: string
  let dirty: Set<string>
  try {
    // --relative: git reports paths from the repo's top level, so a company folder
    // nested inside a larger repo would otherwise list nothing.
    log = (await git(["log", "--relative", `-n${limit}`, "--name-only", `--format=${REC}%aI${FLD}%s${FLD}`, "--", ...MEMORY_PATHS])).stdout
    const diff = (await git(["diff", "--relative", "--name-only", "HEAD", "--", ...MEMORY_PATHS])).stdout
    dirty = new Set(diff.split("\n").map((s) => s.trim()).filter(Boolean))
  } catch {
    return []
  }

  const seen = new Set<string>()
  const found: { rel: string; kind: MemoryKind; changedAt: number }[] = []
  for (const chunk of log.split(REC)) {
    if (!chunk.trim()) continue
    const [date, subject, names = ""] = chunk.split(FLD)
    const changedAt = Math.floor(Date.parse(date) / 1000)
    if (subject === INITIAL_COMMIT_MESSAGE || Number.isNaN(changedAt)) continue
    for (const rel of names.split("\n").map((n) => n.trim()).filter(Boolean)) {
      const kind = kindOf(rel)
      if (!kind || seen.has(rel)) continue
      seen.add(rel)
      found.push({ rel, kind, changedAt })
    }
  }

  const items = await Promise.all(
    found.map(async ({ rel, kind, changedAt }): Promise<MemoryItem | null> => {
      try {
        const raw = dirty.has(rel) ? (await git(["show", `HEAD:./${rel}`])).stdout : await readFn(path.join(rootPath, rel))
        return { path: rel, kind, changedAt, ...readMemoryText(rel, kind, raw) }
      } catch {
        return null
      }
    })
  )
  return items.filter((i): i is MemoryItem => i !== null).sort((a, b) => b.changedAt - a.changedAt)
}

export function thisWeek(items: MemoryItem[], now: Date): MemoryItem[] {
  const cutoff = now.getTime() / 1000 - WEEK_SECONDS
  return items.filter((i) => i.changedAt >= cutoff)
}

const KIND_RANK: Record<MemoryKind, number> = { fact: 0, decision: 1, note: 2 }

/** Fact, then decision, then note, newest first within a kind: a flood of session notes cannot crowd a decision out. */
export function pickForCard(week: MemoryItem[], count = 3): MemoryItem[] {
  return [...week].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.changedAt - a.changedAt).slice(0, count)
}

const NOUN: Record<MemoryKind, [string, string]> = { fact: ["fact", "facts"], decision: ["decision", "decisions"], note: ["note", "notes"] }

/** "1 decision, 2 notes"; empty when nothing is new. */
export function weekSummary(week: MemoryItem[]): string {
  return (["fact", "decision", "note"] as const)
    .map((kind) => {
      const n = week.filter((i) => i.kind === kind).length
      return n ? `${n} ${NOUN[kind][n === 1 ? 0 : 1]}` : ""
    })
    .filter(Boolean)
    .join(", ")
}
