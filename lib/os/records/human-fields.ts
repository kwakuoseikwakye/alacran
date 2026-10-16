import yaml from "yaml"

/**
 * Who owns which part of a record (v240). A records file may declare, at its top level,
 * `human_fields: [notes, status]`: fields people write and a machine never changes. A record with
 * `owner: human` belongs to people entirely. Records are matched by `id`, never by position, so
 * an added or reordered row can never move one person's note onto another.
 *
 * Used where nobody reads the diff: auto-commit refuses any run that crossed these lines and
 * leaves it waiting for the owner instead.
 */
type RecordsDoc = { human_fields?: unknown; records?: unknown }
type Row = Record<string, unknown> & { id?: unknown; owner?: unknown }

function parse(text: string): RecordsDoc | null | "unreadable" {
  if (text.trim() === "") return null
  try {
    const doc = yaml.parse(text) as unknown
    return doc && typeof doc === "object" && !Array.isArray(doc) ? (doc as RecordsDoc) : null
  } catch {
    return "unreadable"
  }
}

const rows = (doc: RecordsDoc | null): Row[] =>
  Array.isArray(doc?.records) ? (doc.records as Row[]).filter((r) => r !== null && typeof r === "object") : []
const fieldsOf = (doc: RecordsDoc | null): string[] =>
  Array.isArray(doc?.human_fields) ? doc.human_fields.filter((f): f is string => typeof f === "string") : []
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function isRecordsFile(relativePath: string): boolean {
  return /^records\/.+\.ya?ml$/.test(relativePath.replaceAll("\\", "/"))
}

/** Plain sentences, one per crossing. Empty means the change only touched machine-owned data. */
export function humanFieldChanges(relativePath: string, oldText: string, newText: string): string[] {
  if (!isRecordsFile(relativePath)) return []
  const before = parse(oldText)
  // A file that was empty or already broken has no ownership to protect.
  if (before === "unreadable" || before === null) return []
  const after = parse(newText)
  if (after === "unreadable") return [`${relativePath} no longer reads as YAML.`]
  const humanFields = fieldsOf(before)
  const out: string[] = []
  if (!same(humanFields, fieldsOf(after))) out.push(`${relativePath}: the list of human-owned fields changed.`)
  const newById = new Map(rows(after).filter((r) => typeof r.id === "string").map((r) => [r.id as string, r]))
  for (const old of rows(before)) {
    if (typeof old.id !== "string") continue
    const next = newById.get(old.id)
    if (old.owner === "human") {
      if (!next) out.push(`${relativePath}: removed ${old.id}, which a person owns.`)
      else if (!same(old, next)) out.push(`${relativePath}: changed ${old.id}, which a person owns.`)
      continue
    }
    if (!next) continue
    const changed = humanFields.filter((f) => !same(old[f], next[f]))
    if (changed.length) out.push(`${relativePath}: changed ${changed.join(", ")} on ${old.id}, which people write.`)
  }
  return out
}
