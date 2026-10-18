export type LinkIndex = {
  paths: Set<string>
  stems: Map<string, string | null>
  folders: Map<string, string>
  commands: Map<string, string>
}

// Global so Task 7 can matchAll them; every use below goes through a fresh
// copy so a shared lastIndex can never leak between calls.
export const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g
export const PATH_RE = /(?:^|[\s`(])((?:definitions|docs|notes|records)\/[\w./-]+)/g
// A "/name" only counts at a token start, so URL paths never match.
const COMMAND_RE = /(?:^|[\s`])\/([a-z][\w-]*)/g

const fresh = (re: RegExp) => new RegExp(re.source, re.flags)

const stemOf = (path: string) => {
  const base = path.slice(path.lastIndexOf("/") + 1)
  const dot = base.lastIndexOf(".")
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase()
}

export function buildLinkIndex(
  paths: string[],
  skills: { id: string; nodeId: string }[],
  folderHubs: Record<string, string>,
): LinkIndex {
  const stems = new Map<string, string | null>()
  for (const p of paths) {
    const s = stemOf(p)
    // A shared stem is ambiguous: null means "drop it", never "pick one".
    stems.set(s, stems.has(s) ? null : p)
  }
  return {
    paths: new Set(paths),
    stems,
    folders: new Map(Object.entries(folderHubs)),
    commands: new Map(skills.map((s) => [`/${s.id}`, s.nodeId])),
  }
}

export function extractLinks(text: string, index: LinkIndex, selfId: string): string[] {
  const out = new Set<string>()

  for (const m of text.matchAll(fresh(WIKI_LINK_RE))) {
    const hit = index.stems.get(m[1].trim().toLowerCase())
    if (hit) out.add(hit)
  }

  // Longest folder prefix first, so notes/company/sessions/ beats notes/.
  const prefixes = [...index.folders.keys()].sort((a, b) => b.length - a.length)
  for (const m of text.matchAll(fresh(PATH_RE))) {
    const path = m[1].replace(/[.,;:]+$/, "")
    if (index.paths.has(path)) {
      out.add(path)
      continue
    }
    const dir = path.endsWith("/") ? path : `${path}/`
    const prefix = prefixes.find((p) => dir.startsWith(p))
    if (prefix) out.add(index.folders.get(prefix)!)
  }

  for (const m of text.matchAll(fresh(COMMAND_RE))) {
    const hit = index.commands.get(`/${m[1]}`)
    if (hit) out.add(hit)
  }

  out.delete(selfId)
  return [...out].sort()
}
