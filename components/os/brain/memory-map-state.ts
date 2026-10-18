import type { KnowledgeState, MemoryEdge, MemoryNode, MemoryNodeType } from "@/lib/os/brain/memory-graph-types"
import { PATH_RE, WIKI_LINK_RE, resolvePath, resolveWiki, trimPath, type LinkIndex } from "@/lib/os/brain/memory-links"

/** Map-scoped hues (globals.css) so both themes read; red stays reserved for "unsure". */
export const TYPE_COLOR: Record<MemoryNodeType, string> = {
  fact: "var(--mm-fact)",
  decision: "var(--mm-decision)",
  note: "var(--mm-note)",
  session: "var(--mm-session)",
  skill: "var(--mm-skill)",
  hub: "var(--mm-hub)",
}

export function neighbours(edges: MemoryEdge[], id: string): Set<string> {
  const out = new Set<string>()
  for (const e of edges) {
    if (e.source === id) out.add(e.target)
    if (e.target === id) out.add(e.source)
  }
  return out
}

/** Hubs stay so a filtered map keeps its folders as anchors. */
export function visibleNodes(nodes: MemoryNode[], hidden: Set<MemoryNodeType>, query: string): Set<string> {
  const q = query.trim().toLowerCase()
  return new Set(
    nodes
      .filter(
        (n) =>
          n.type === "hub" ||
          (!hidden.has(n.type) && (!q || n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)))
      )
      .map((n) => n.id)
  )
}

/**
 * Which nodes stay lit; null means all of them. One precedence: a hovered or
 * selected node (its neighbourhood) wins over a summary-stat focus. The map
 * keeps the two from fighting by clearing one when the other is set.
 */
export function litNodes(
  nodes: MemoryNode[],
  edges: MemoryEdge[],
  activeId: string | null,
  focusState: KnowledgeState | null
): Set<string> | null {
  if (activeId) return new Set([activeId, ...neighbours(edges, activeId)])
  if (focusState) return new Set(nodes.filter((n) => n.state === focusState).map((n) => n.id))
  return null
}

export const confirmFactPrompt = (node: MemoryNode) =>
  `Let's settle this unconfirmed fact in company.yaml: ${node.label} (${node.path}). Ask me what's true, then propose the edit for approval.`

export type NoteSegment = { text: string } | { text: string; nodeId: string }

/** Splits a note into plain text and the links the map draws, resolved exactly as extractLinks does. */
export function linkify(text: string, index: LinkIndex, selfId: string): NoteSegment[] {
  const hits: { start: number; end: number; nodeId: string }[] = []
  for (const m of text.matchAll(new RegExp(WIKI_LINK_RE))) {
    const nodeId = resolveWiki(m[1], index)
    if (nodeId) hits.push({ start: m.index, end: m.index + m[0].length, nodeId })
  }
  for (const m of text.matchAll(new RegExp(PATH_RE))) {
    const path = trimPath(m[1])
    // The match may start on the whitespace before the path; the link starts at the path.
    const start = m.index + m[0].length - m[1].length
    const nodeId = resolvePath(path, index)
    if (nodeId) hits.push({ start, end: start + path.length, nodeId })
  }
  hits.sort((a, b) => a.start - b.start)

  const out: NoteSegment[] = []
  let at = 0
  for (const h of hits) {
    if (h.start < at || h.nodeId === selfId) continue
    if (h.start > at) out.push({ text: text.slice(at, h.start) })
    out.push({ text: text.slice(h.start, h.end), nodeId: h.nodeId })
    at = h.end
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}
