import { parse } from "yaml"
import { diffArrays } from "diff"

export type ProposedFact = { kind: "fact" | "decision" | "unconfirmed"; target: string; value: string; was: string; quote: string; line: string }
export type ProposedFacts = { state: "none" } | { state: "unreadable" } | { state: "ok"; facts: ProposedFact[] }
export type SourcedChange = { field: string; was: string | null; now: string; source: string }

const KINDS = new Set(["fact", "decision", "unconfirmed"])

/**
 * The "## Proposed fact changes" section an automatic session note ends with (format fixed by the
 * unattended prompt in registry.ts). All or nothing: one malformed line makes the whole section
 * "unreadable", because rows the owner approves must be exactly what the note says.
 */
export function parseProposedFacts(markdown: string): ProposedFacts {
  const lines = markdown.split("\n")
  const start = lines.findIndex((l) => /^##\s+Proposed fact changes\s*$/.test(l.trim()))
  if (start === -1) return { state: "none" }
  const body: string[] = []
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(l)) break
    if (l.trim()) body.push(l.trim())
  }
  if (body.length === 0) return { state: "none" }
  const facts: ProposedFact[] = []
  for (const line of body) {
    if (!line.startsWith("- ")) return { state: "unreadable" }
    const parts = line.slice(2).split(" | ").map((s) => s.trim())
    if (parts.length !== 5) return { state: "unreadable" }
    const [kind, target, value, wasPart, quotePart] = parts
    if (!KINDS.has(kind) || !target || !value || !wasPart.startsWith("was:")) return { state: "unreadable" }
    const was = wasPart.slice(4).trim()
    if (!was) return { state: "unreadable" }
    const quote = quotePart.replace(/^"|"$/g, "")
    if (!quote) return { state: "unreadable" }
    facts.push({ kind: kind as ProposedFact["kind"], target, value, was, quote, line })
  }
  return { state: "ok", facts }
}

// A "# source: ..." comment on a changed line. Requires the literal "source:" after the hash,
// so any other "#" inside a value is not a source.
const SOURCE = /^(.*?)\s+#\s*source:\s*(.+?)\s*$/

type Hunk = { removed: string[]; added: { text: string; idx: number }[] }

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

/** Line diff, grouped into hunks (consecutive removed and added lines). `idx` is the line in the new text. */
function hunksOf(oldLines: string[], newLines: string[]): Hunk[] {
  const out: Hunk[] = []
  let cur: Hunk = { removed: [], added: [] }
  const flush = () => {
    if (cur.removed.length || cur.added.length) out.push(cur)
    cur = { removed: [], added: [] }
  }
  let n = 0
  for (const c of diffArrays(oldLines, newLines)) {
    if (c.added) for (const text of c.value) cur.added.push({ text, idx: n++ })
    else if (c.removed) cur.removed.push(...c.value)
    else { flush(); n += c.value.length }
  }
  flush()
  return out
}

const stripComment = (text: string) => text.replace(/\s+#.*$/, "")
const indentOf = (l: string) => l.length - l.trimStart().length

/** One YAML-ish line: list marker, key and value. Scalars have key null. */
function parseLine(text: string): { list: boolean; key: string | null; value: string } {
  const list = /^\s*-(\s|$)/.test(text)
  const body = text.trim().replace(/^-(\s+|$)/, "")
  const kv = body.match(/^([^\s:#][^:#]*?):(?:\s+(.*))?$/)
  return kv
    ? { list, key: kv[1].trim(), value: (kv[2] ?? "").trim() }
    : { list, key: null, value: body }
}

/**
 * Field path rule: the ancestors of a line are the nearest preceding lines with strictly smaller
 * indentation, walked upward in the NEW text. An ancestor reads as its key; a list item whose
 * first key is name/id reads as that value; any other list item reads as its own key.
 * Leaf = the line's own key, joined with " › ". A scalar list item reads as "<parents> (list item)".
 */
function ancestorNames(lines: string[], idx: number): string[] {
  const out: string[] = []
  let cur = indentOf(lines[idx])
  for (let j = idx - 1; j >= 0 && cur > 0; j--) {
    const l = lines[j]
    if (!l.trim() || l.trim().startsWith("#") || indentOf(l) >= cur) continue
    const p = parseLine(stripComment(l))
    const named = p.list && (p.key === "name" || p.key === "id") && p.value
    out.unshift(named ? p.value : p.key ?? p.value)
    cur = indentOf(l)
  }
  return out
}

/** Lines the live agent changed in company.yaml that carry "# source:", with the old value of the same key. */
export function sourcedChanges(oldText: string, newText: string): SourcedChange[] {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  const out: SourcedChange[] = []
  for (const h of hunksOf(oldLines, newLines)) {
    for (const a of h.added) {
      const m = a.text.match(SOURCE)
      if (!m || !m[1].trim()) continue
      const p = parseLine(stripComment(m[1]))
      const anc = ancestorNames(newLines, a.idx)
      const field = p.key === null
        ? (p.list ? `${anc.join(" › ")}${anc.length ? " " : ""}(list item)` : [...anc, p.value].join(" › "))
        : [...anc, p.key].join(" › ")
      const now = p.key !== null && p.value === "" ? "(changed below)" : p.value
      const prev = h.removed
        .map((r) => parseLine(stripComment(r)))
        .find((r) => r.key === p.key && (p.key !== null || r.list === p.list))
      const was = prev === undefined ? null : prev.key !== null && prev.value === "" ? "(changed below)" : prev.value
      out.push({ field, was, now, source: m[2].trim() })
    }
  }
  return out
}

/** Added non-blank, non-comment lines with no "# source:" comment, so nothing in company.yaml changes unseen. */
export function unsourcedChanges(oldText: string, newText: string): string[] {
  const out: string[] = []
  for (const h of hunksOf(splitLines(oldText), splitLines(newText))) {
    for (const a of h.added) {
      const t = a.text.trim()
      if (!t || t.startsWith("#") || SOURCE.test(a.text)) continue
      out.push(t)
    }
  }
  return out
}

/** Removed non-blank lines that no added line in the same hunk replaces (same key), so deletions are never invisible. */
export function removedLines(oldText: string, newText: string): string[] {
  const out: string[] = []
  for (const h of hunksOf(splitLines(oldText), splitLines(newText))) {
    const addedKeys = new Set(h.added.map((a) => parseLine(stripComment(a.text)).key).filter((k) => k !== null))
    for (const r of h.removed) {
      const t = r.trim()
      if (!t) continue
      const key = parseLine(stripComment(r)).key
      if (key !== null && addedKeys.has(key)) continue
      out.push(t)
    }
  }
  return out
}

export function isBrokenYaml(text: string): boolean {
  try { parse(text); return false } catch { return true }
}
