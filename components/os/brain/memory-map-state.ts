import type { KnowledgeState, MemoryEdge, MemoryNode, MemoryNodeType } from "@/lib/os/brain/memory-graph-types"

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
