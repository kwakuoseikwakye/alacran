"use client"

import { useState } from "react"
import { GraphCanvas } from "./graph-canvas"
import type { GraphNode, GraphEdge } from "@/lib/os/brain/graph"

/**
 * Owns the one piece of state the graph needs: which node is selected.
 * Clicking a node fills the review rail's slot with that node's detail
 * instead of the rail's own default content (the claim queue); clicking the
 * close control (or another node) returns the slot to `rail`.
 */
export function GraphTab({ nodes, edges, rail }: { nodes: GraphNode[]; edges: GraphEdge[]; rail: React.ReactNode }) {
  const [selected, setSelected] = useState<GraphNode | null>(null)

  return (
    <div className="brain-layout">
      <div className="brain-main">
        <GraphCanvas nodes={nodes} edges={edges} onSelect={setSelected} />
      </div>
      <aside className="brain-rail">
        {selected ? (
          <div className="brain-node-detail">
            <button
              type="button"
              className="brain-node-detail-close"
              onClick={() => setSelected(null)}
              aria-label="Close node detail"
            >
              ×
            </button>
            <p className="eyebrow">{selected.kind}</p>
            <h3>{selected.label}</h3>
            <p className="brain-node-detail-state">
              {selected.state === "fact"
                ? "Asserted by the ontology."
                : "No role in the ontology owns this step — unverified, shown dim in the graph."}
            </p>
          </div>
        ) : (
          rail
        )}
      </aside>
    </div>
  )
}
