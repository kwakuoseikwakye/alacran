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

/** The yaml key path and current text make the fact unambiguous: labels like "bottleneck" repeat. */
export function confirmFactPrompt(node: MemoryNode): string {
  const key = node.id.startsWith("yaml:") ? ` (key ${node.id.slice("yaml:".length)})` : ""
  const says = node.summary ? `, which currently says "${node.summary}"` : ""
  return `Let's settle this unconfirmed fact in ${node.path}: ${node.label}${key}${says}. Ask me what's true, then propose the edit for approval.`
}

export type View = { x: number; y: number; k: number }

/** The view that centres these points in a w x h canvas, padded for labels, scale clamped to 0.3..2. */
export function fitTransform(points: { x: number; y: number }[], w: number, h: number, pad: number): View | null {
  if (!points.length) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const k = Math.min(2, Math.max(0.3, Math.min(w / (x1 - x0 + 2 * pad), h / (y1 - y0 + 2 * pad))))
  return { k, x: w / 2 - ((x0 + x1) / 2) * k, y: h / 2 - ((y0 + y1) / 2) * k }
}

/** Pans (never zooms) so a point outside the view, less a margin, lands in the centre. */
export function panInto(p: { x: number; y: number }, view: View, w: number, h: number, margin: number): View {
  const sx = p.x * view.k + view.x
  const sy = p.y * view.k + view.y
  if (sx >= margin && sx <= w - margin && sy >= margin && sy <= h - margin) return view
  return { k: view.k, x: w / 2 - p.x * view.k, y: h / 2 - p.y * view.k }
}

/** Labelled at any zoom: the nodes that say what the map is. */
export const isLandmark = (n: MemoryNode) => n.type === "hub" || n.type === "skill" || n.state !== "lookup"

/** Obsidian-style: landmarks, what the person is pointing at and what they searched for; everything once zoomed in. */
export function shouldLabel(
  n: MemoryNode,
  ctx: { k: number; selectedId: string | null; near: Set<string> | null; matches: Set<string> | null }
): boolean {
  return (
    ctx.k >= 1.4 ||
    isLandmark(n) ||
    n.id === ctx.selectedId ||
    (ctx.near?.has(n.id) ?? false) ||
    (ctx.matches?.has(n.id) ?? false)
  )
}

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
