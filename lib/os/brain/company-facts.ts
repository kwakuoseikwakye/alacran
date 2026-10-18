import { isMap, isScalar, isSeq, parseDocument, type Node, type YAMLMap } from "yaml"
import type { CompanyFact } from "./memory-graph-types"

const UNSURE = /<<TODO>>|#\s*unconfirmed/i
const LABEL_KEYS = ["name", "channel", "step", "decision", "id"]
const SUMMARY_KEYS = ["promise", "job_to_be_done", "notes", "owns"]

function clip(s: string): string {
  return s.length > 140 ? `${s.slice(0, 139)}…` : s
}

function str(map: YAMLMap, key: string): string | undefined {
  const v = map.get(key)
  return typeof v === "string" && v.trim() ? v.trim() : undefined
}

/**
 * One fact per list item and per scalar field of company.yaml, minus `meta`.
 * "Unsure" is read from the raw lines the node spans, not from the yaml
 * comment API: a trailing comment attaches to different nodes depending on
 * layout, the text does not.
 */
export function readCompanyFacts(raw: string): CompanyFact[] {
  const doc = parseDocument(raw)
  if (doc.errors.length > 0 || !isMap(doc.contents)) return []

  const facts: CompanyFact[] = []

  const unsureAt = (node: Node): boolean => {
    if (!node.range) return false
    const start = raw.lastIndexOf("\n", node.range[0] - 1) + 1
    let end = node.range[1]
    // a block node's range can end just past its newline, i.e. on the next line
    while (end > start && raw[end - 1] === "\n") end--
    const eol = raw.indexOf("\n", end)
    return UNSURE.test(raw.slice(start, eol === -1 ? raw.length : eol))
  }

  const push = (keyPath: string, lastKey: string, node: Node) => {
    const value = node.toJSON() as unknown
    const map = isMap(node) ? node : undefined
    const label = map ? LABEL_KEYS.map((k) => str(map, k)).find(Boolean) : undefined
    const summary = map
      ? SUMMARY_KEYS.map((k) => str(map, k)).find(Boolean)
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : undefined
    facts.push({
      id: `yaml:${keyPath}`,
      label: label ?? lastKey,
      keyPath,
      summary: clip(summary ?? ""),
      unsure: unsureAt(node),
    })
  }

  const walk = (pairs: YAMLMap["items"], prefix: string) => {
    for (const pair of pairs) {
      const key = String(isScalar(pair.key) ? pair.key.value : pair.key)
      const keyPath = prefix ? `${prefix}.${key}` : key
      const v = pair.value as Node | null
      if (isSeq(v)) v.items.forEach((item, i) => push(`${keyPath}.${i}`, key, item as Node))
      else if (isMap(v)) walk(v.items, keyPath)
      else if (isScalar(v)) push(keyPath, key, v)
    }
  }

  // "::: bad" is valid yaml (a map with key "::"); real top-level keys are words
  walk(
    doc.contents.items.filter(
      (p) => isScalar(p.key) && /^\w[\w-]*$/.test(String(p.key.value)) && p.key.value !== "meta"
    ),
    ""
  )
  return facts
}
