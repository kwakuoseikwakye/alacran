import type { MemoryEdge, MemoryNode, MemoryNodeType } from "@/lib/os/brain/memory-graph-types"

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
