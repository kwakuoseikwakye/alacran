"use client"

import { useEffect, useState } from "react"
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force"
import type { GraphNode, GraphEdge } from "@/lib/os/brain/graph"

type SimNode = GraphNode & SimulationNodeDatum
type RenderedLink = { id: string; source: SimNode; target: SimNode }

const WIDTH = 880
const HEIGHT = 560

/** Real ontology labels run to ~100 characters ("Complete initial company setup
 *  to establish declarative facts in definitions/ontology/company.yaml").
 *  Rendered whole they are unreadable, and no collision radius can space them. */
const MAX_LABEL = 18
/** JetBrains Mono advance at the 9px `.brain-graph-label` sets. */
const CHAR_W = 5.4

const truncate = (label: string) =>
  label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label

/**
 * A force-directed layout, not a fixed one — this is what `components/
 * network-graph.tsx` deliberately isn't (its own comment says so). `forceCollide`
 * is the whole reason d3-force is here rather than a hand-rolled integrator: it
 * is what keeps a 15-node graph from stacking labels on top of each other.
 */
export function GraphCanvas({
  nodes,
  edges,
  onSelect,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onSelect?: (node: GraphNode) => void
}) {
  const [renderNodes, setRenderNodes] = useState<SimNode[]>([])
  const [renderLinks, setRenderLinks] = useState<RenderedLink[]>([])

  // Keyed on CONTENT, not array identity. `components/auto-refresh.tsx` calls
  // router.refresh() every 15s, and each refresh hands this component brand-new
  // nodes/edges arrays whose contents are identical. Keying the effect on those
  // references restarted the whole 300-tick simulation every 15 seconds, for as
  // long as the tab stayed open — the graph visibly re-scrambled itself. The
  // ontology only changes when someone edits company.yaml, so a content key
  // restarts the layout exactly when the layout should actually change.
  const graphKey = JSON.stringify([nodes, edges])

  useEffect(() => {
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }))
    const byId = new Map(simNodes.map((n) => [n.id, n]))
    const simLinks: SimulationLinkDatum<SimNode>[] = edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))

    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
          .id((d) => d.id)
          .distance(72)
      )
      .force("charge", forceManyBody().strength(-170))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      // Sized from the node's own LABEL, not its circle. A fixed radius cannot
      // separate labels of wildly different widths: measured against the real
      // ontology, forceCollide(38) still left 9 overlapping label pairs, because
      // the longest label is many times wider than 38px. Half the rendered
      // label's width plus a gutter is the number that actually holds.
      .force(
        "collide",
        forceCollide<SimNode>((d) => Math.max(26, (truncate(d.label).length * CHAR_W) / 2 + 10))
      )
      .on("tick", () => {
        setRenderNodes([...simNodes])
        // forceLink resolves string ids to real node references in place
        // after its first tick, which is why this cast is safe here and not
        // at the point of construction above.
        setRenderLinks(
          simLinks.map((l, i) => ({ id: String(i), source: l.source as SimNode, target: l.target as SimNode }))
        )
      })

    // The whole reason this matters: a simulation left running after unmount
    // survives every client-side navigation, ticking forever for a canvas
    // nobody can see.
    return () => {
      simulation.stop()
    }
    // `nodes`/`edges` are read above but deliberately NOT deps: graphKey is
    // their content, which is the thing that should trigger a relayout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey])

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="brain-graph" role="img" aria-label="Company knowledge graph">
      <g>
        {renderLinks.map((l) => (
          <line
            key={l.id}
            x1={l.source.x ?? 0}
            y1={l.source.y ?? 0}
            x2={l.target.x ?? 0}
            y2={l.target.y ?? 0}
            stroke="var(--graph-edge)"
            strokeWidth={1}
          />
        ))}
      </g>
      <g>
        {renderNodes.map((n) => (
          <g
            key={n.id}
            transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}
            className="brain-graph-node"
            onClick={() => onSelect?.(n)}
            tabIndex={0}
            role="button"
            aria-label={`${n.kind}: ${n.label}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect?.(n)
            }}
          >
            <circle r={n.kind === "root" ? 13 : 9} fill={n.state === "fact" ? "var(--graph-fact)" : "var(--graph-dim)"} />
            <text y={22} textAnchor="middle" className="brain-graph-label">
              {truncate(n.label)}
              {/* The full label stays reachable on hover; the <g>'s aria-label
                  already carries it in full for assistive tech. */}
              <title>{n.label}</title>
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}
