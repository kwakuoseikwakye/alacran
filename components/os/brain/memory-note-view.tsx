"use client"

import { hubOf } from "@/lib/os/brain/memory-graph"
import type { MemoryGraph, MemoryNode } from "@/lib/os/brain/memory-graph-types"
import type { LinkIndex } from "@/lib/os/brain/memory-links"
import { TYPE_COLOR, linkify, neighbours } from "./memory-map-state"

const W = 300
const H = 240
const MAX_LABEL = 18
const short = (label: string) => (label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label)

const Dot = ({ node }: { node: MemoryNode }) => (
  <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[node.type] }} />
)

export function MemoryNoteView({
  graph,
  node,
  text,
  failed,
  index,
  onOpen,
  onBack,
}: {
  graph: MemoryGraph
  node: MemoryNode
  /** null while the note is still loading. */
  text: string | null
  failed: boolean
  index: LinkIndex
  onOpen: (id: string) => void
  onBack: () => void
}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))

  // Group the files by their folder hub, the same buckets the map draws.
  const groups = new Map<string, MemoryNode[]>()
  for (const n of graph.nodes) {
    if (n.type === "hub" || n.id.startsWith("yaml:")) continue
    const hub = hubOf(n.path)
    const key = hub ? byId.get(hub)?.label ?? hub : n.type === "skill" ? "Skills" : "Top level"
    groups.set(key, [...(groups.get(key) ?? []), n])
  }

  const near = [...neighbours(graph.edges, node.id)].flatMap((id) => byId.get(id) ?? [])

  return (
    <div className="flex h-full min-h-[560px] text-[13px] text-os-text">
      <nav aria-label="Files" className="w-[240px] shrink-0 overflow-auto border-r border-os-border bg-os-surface p-3">
        {[...groups].map(([label, files]) => (
          <div key={label} className="mb-3">
            <h3 className="mb-1 text-[11px] uppercase tracking-[.06em] text-os-muted">{label}</h3>
            {files.map((f) => (
              <button
                key={f.id}
                type="button"
                title={`Open ${f.label}`}
                aria-current={f.id === node.id ? "page" : undefined}
                onClick={() => onOpen(f.id)}
                className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:text-os-accent ${f.id === node.id ? "bg-os-text/10" : ""}`}
              >
                <Dot node={f} />
                <span className="truncate">{f.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="min-w-0 flex-1 overflow-auto p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{node.label}</h2>
            <div className="break-all font-mono text-[11px] text-os-muted">{node.path}</div>
          </div>
          <button
            type="button"
            title="Close the note and return to the map (Esc)"
            onClick={onBack}
            className="ml-auto shrink-0 rounded-lg border border-os-border px-3 py-1.5"
          >
            Back to the map
          </button>
        </div>
        {failed ? (
          <p className="text-os-muted">Couldn&apos;t open this note.</p>
        ) : text === null ? (
          <p className="text-os-muted">Opening the note…</p>
        ) : (
          <div className="font-mono text-[12px] leading-relaxed" style={{ whiteSpace: "pre-wrap" }}>
            {linkify(text, index, node.id).map((s, i) =>
              "nodeId" in s ? (
                <button
                  key={i}
                  type="button"
                  title={`Open ${byId.get(s.nodeId)?.label ?? s.nodeId}`}
                  onClick={() => onOpen(s.nodeId)}
                  className="text-os-accent underline underline-offset-2"
                >
                  {s.text}
                </button>
              ) : (
                <span key={i}>{s.text}</span>
              )
            )}
          </div>
        )}
      </main>

      <aside className="w-[300px] shrink-0 border-l border-os-border bg-os-surface p-3">
        <h3 className="mb-1 text-[11px] uppercase tracking-[.06em] text-os-muted">Linked to</h3>
        <LocalMap node={node} near={near} onOpen={onOpen} />
      </aside>
    </div>
  )
}

/** A static ring: one note and its neighbours needs no force layout. */
function LocalMap({ node, near, onOpen }: { node: MemoryNode; near: MemoryNode[]; onOpen: (id: string) => void }) {
  const cx = W / 2
  const cy = H / 2
  const ring = near.map((n, i) => {
    const a = (i / near.length) * 2 * Math.PI - Math.PI / 2
    return { n, x: cx + Math.cos(a) * 90, y: cy + Math.sin(a) * 80 }
  })
  const dot = (n: MemoryNode, x: number, y: number, centre: boolean) => (
    <g
      key={n.id}
      transform={`translate(${x}, ${y})`}
      className={centre ? undefined : "cursor-pointer"}
      onClick={centre ? undefined : () => onOpen(n.id)}
      role={centre ? undefined : "button"}
      tabIndex={centre ? undefined : 0}
      aria-label={centre ? undefined : `Open ${n.label}`}
      onKeyDown={
        centre
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onOpen(n.id)
              }
            }
      }
    >
      <circle r={centre ? 9 : 6} fill={TYPE_COLOR[n.type]} />
      {centre && <circle r={12} fill="none" stroke="var(--accent)" strokeWidth={1} />}
      <text y={centre ? 24 : 18} textAnchor="middle" fontSize={10} className="pointer-events-none font-mono" fill={centre ? "var(--text)" : "var(--text-2)"}>
        {short(n.label)}
        <title>{n.label}</title>
      </text>
    </g>
  )
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="group" aria-label={`What ${node.label} links to`}>
      {ring.map(({ n, x, y }) => (
        <line key={n.id} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border-strong)" strokeWidth={1} />
      ))}
      {ring.map(({ n, x, y }) => dot(n, x, y, false))}
      {dot(node, cx, cy, true)}
    </svg>
  )
}
