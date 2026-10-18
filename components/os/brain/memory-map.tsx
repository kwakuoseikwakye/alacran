"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force"
import { ASSISTANT_OPEN_EVENT } from "@/components/os/assistant-dock"
import type { KnowledgeState, MemoryGraph, MemoryNode, MemoryNodeType } from "@/lib/os/brain/memory-graph-types"
import { confirmFactPrompt, litNodes, neighbours, visibleNodes } from "./memory-map-state"

type SimNode = MemoryNode & SimulationNodeDatum

const WIDTH = 900
const HEIGHT = 560
const MAX_LABEL = 22
/** Mono advance at the 10px label size. */
const CHAR_W = 6
const truncate = (label: string) => (label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label)

/** Map-scoped hues (globals.css) so both themes read; red stays reserved for "unsure". */
const TYPE_COLOR: Record<MemoryNodeType, string> = {
  fact: "var(--mm-fact)",
  decision: "var(--mm-decision)",
  note: "var(--mm-note)",
  session: "var(--mm-session)",
  skill: "var(--mm-skill)",
  hub: "var(--mm-hub)",
}
const TYPE_NAME: Record<MemoryNodeType, string> = {
  fact: "Fact",
  decision: "Decision",
  note: "Note",
  session: "Past session",
  skill: "Agent skill",
  hub: "Folder",
}
const CHIPS: { type: MemoryNodeType; label: string; title: string }[] = [
  { type: "fact", label: "Facts", title: "Show or hide company facts" },
  { type: "decision", label: "Decisions", title: "Show or hide decisions" },
  { type: "note", label: "Notes", title: "Show or hide working notes" },
  { type: "session", label: "Sessions", title: "Show or hide past sessions" },
  { type: "skill", label: "Skills", title: "Show or hide agent skills" },
]
const PLURAL: Record<MemoryNodeType, string> = {
  fact: "facts",
  decision: "decisions",
  note: "notes",
  session: "sessions",
  skill: "skills",
  hub: "folders",
}
const BADGE: Record<KnowledgeState, { text: string; className: string }> = {
  always: { text: "AI always knows this — read at the start of every session", className: "bg-os-text/10 text-os-text" },
  lookup: { text: "AI can look this up when a task points here", className: "bg-os-text/5 text-os-muted" },
  unsure: { text: "AI is unsure — marked unconfirmed", className: "bg-destructive/10 text-destructive" },
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word.replace(/s$/, "") : word}`
const isFile = (n: MemoryNode) => n.type !== "hub" && !n.id.startsWith("yaml:")

function StateDot({ state }: { state: KnowledgeState }) {
  if (state === "unsure") return <span className="inline-block size-2.5 rounded-full border-[1.5px] border-dashed border-destructive" />
  if (state === "always") return <span className="inline-block size-2.5 rounded-full bg-os-text shadow-[0_0_8px_var(--text)]" />
  return <span className="inline-block size-2.5 rounded-full bg-os-text/35" />
}

function TypeDot({ type }: { type: MemoryNodeType }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[type] }} />
}

export function MemoryMap({
  companyId,
  graph,
  onOpenNote,
  initialSelectedId = null,
}: {
  companyId: string
  graph: MemoryGraph
  /** Lets a static render show the side panel; the page leaves it unset. */
  initialSelectedId?: string | null
  /** The note view (Task 7) hooks in here; hubs never call it, `yaml:` items pass a node whose path is company.yaml. */
  onOpenNote?: (node: MemoryNode) => void
}) {
  const [hidden, setHidden] = useState<Set<MemoryNodeType>>(new Set())
  const [query, setQuery] = useState("")
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [focusState, setFocusState] = useState<KnowledgeState | null>(null)

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])
  const visible = useMemo(() => visibleNodes(graph.nodes, hidden, query), [graph, hidden, query])
  const selected = selectedId ? byId.get(selectedId) ?? null : null

  const always = graph.nodes.filter((n) => n.state === "always" && isFile(n)).map((n) => n.label)
  const lookupByType = CHIPS.map(({ type }) => [type, graph.nodes.filter((n) => n.state === "lookup" && isFile(n) && n.type === type).length] as const)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => plural(count, PLURAL[type]))
  const stats: { state: KnowledgeState; label: string; value: string; detail: string; title: string }[] = [
    { state: "always", label: "Always knows", value: plural(graph.counts.alwaysFiles, "files"), detail: always.join(" · "), title: "Read by every AI session the moment it starts" },
    { state: "lookup", label: "Can look up", value: plural(graph.counts.lookupFiles, "files"), detail: lookupByType.join(" · "), title: "Read only when a task or skill points the AI there" },
    { state: "unsure", label: "Unsure about", value: plural(graph.counts.unsureFacts, "facts"), detail: graph.counts.unsureFacts ? "tap to see them" : "nothing unconfirmed", title: "Facts marked TODO or unconfirmed — the AI is unsure" },
  ]

  const toggleType = (type: MemoryNodeType) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })

  const confirmFact = (node: MemoryNode) =>
    window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT, { detail: { companyId, prompt: confirmFactPrompt(node) } }))

  // Selecting a node and focusing a stat clear each other, so whichever the person did last is what lights up.
  const select = (id: string | null) => {
    setSelectedId(id)
    if (id) setFocusState(null)
  }

  // One window handler so the note view (Task 7) can add its own Escape step here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc in the search box (or anything editable) belongs to that field.
      const t = e.target as HTMLElement | null
      if (e.defaultPrevented || t?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return
      if (e.key === "Escape") setSelectedId(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex h-full min-h-[560px] flex-col text-[13px] text-os-text">
      <div className="flex items-center gap-3 border-b border-os-border px-4 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search what the AI knows…"
          title="Find any fact, note, decision or skill"
          aria-label="Search what the AI knows"
          className="ml-auto w-60 rounded-lg border border-os-border bg-os-surface px-2.5 py-1.5 text-os-text placeholder:text-os-muted"
        />
      </div>

      <div className="flex flex-wrap gap-2.5 border-b border-os-border px-4 py-3">
        {stats.map((s) => (
          <button
            key={s.state}
            type="button"
            title={s.title}
            aria-pressed={focusState === s.state}
            onClick={() => {
              setSelectedId(null)
              setFocusState((prev) => (prev === s.state ? null : s.state))
            }}
            className={`min-w-[190px] rounded-[10px] border bg-os-surface px-3.5 py-2.5 text-left ${focusState === s.state ? "border-os-accent" : "border-os-border"}`}
          >
            <span className="flex items-center gap-2 text-xs text-os-muted">
              <StateDot state={s.state} />
              {s.label}
            </span>
            <b className="block text-xl font-semibold text-os-text">{s.value}</b>
            <span className="block text-xs text-os-muted">{s.detail}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.type}
              type="button"
              title={c.title}
              aria-pressed={!hidden.has(c.type)}
              onClick={() => toggleType(c.type)}
              className={`flex items-center gap-1.5 rounded-full border border-os-border bg-os-surface px-2.5 py-1 text-xs text-os-text ${hidden.has(c.type) ? "opacity-45" : ""}`}
            >
              <TypeDot type={c.type} />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {graph.nodes.length ? (
            <MapCanvas
              graph={graph}
              visible={visible}
              activeId={hoverId ?? selectedId}
              selectedId={selectedId}
              focusState={focusState}
              onHover={setHoverId}
              onSelect={select}
            />
          ) : (
            <p className="p-6 text-sm text-os-muted">Nothing saved yet.</p>
          )}
          {graph.nodes.length > 0 && (
            <p className="pointer-events-none absolute bottom-3.5 left-4 text-xs text-os-muted">
              Hover a dot to see what it links to · click to open it · scroll to zoom, drag to move
            </p>
          )}
        </div>

        <aside className="w-[340px] shrink-0 overflow-auto border-l border-os-border bg-os-surface p-[18px]">
          {selected ? (
            <SidePanel
              node={selected}
              linked={[...neighbours(graph.edges, selected.id)].flatMap((id) => byId.get(id) ?? [])}
              onSelect={select}
              onConfirm={confirmFact}
              onOpenNote={onOpenNote}
            />
          ) : (
            <p className="text-os-muted">Click a dot to see what the AI knows about it.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function SidePanel({
  node,
  linked,
  onSelect,
  onConfirm,
  onOpenNote,
}: {
  node: MemoryNode
  linked: MemoryNode[]
  onSelect: (id: string) => void
  onConfirm: (node: MemoryNode) => void
  onOpenNote?: (node: MemoryNode) => void
}) {
  const unsure = node.state === "unsure"
  const isYaml = node.id.startsWith("yaml:")
  const badge = BADGE[node.state]
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[.06em] text-os-muted">
        <TypeDot type={node.type} />
        {TYPE_NAME[node.type]}
      </div>
      <h2 className="mt-1.5 mb-0.5 text-base font-semibold text-os-text">{node.label}</h2>
      {node.path && <div className="break-all font-mono text-[11px] text-os-muted">{node.path}</div>}
      {node.type !== "hub" && (
        <div className={`my-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${badge.className}`}>
          <StateDot state={node.state} />
          {badge.text}
        </div>
      )}
      {node.summary && (
        <>
          <h3 className="mt-[18px] mb-1.5 text-[11px] uppercase tracking-[.06em] text-os-muted">What it says</h3>
          <p className="mb-2">{node.summary}</p>
        </>
      )}
      {linked.length > 0 && (
        <>
          <h3 className="mt-[18px] mb-1.5 text-[11px] uppercase tracking-[.06em] text-os-muted">Linked to</h3>
          {linked.map((n) => (
            <button
              key={n.id}
              type="button"
              title={`Show ${n.label} on the map`}
              onClick={() => onSelect(n.id)}
              className="flex w-full items-center gap-2 border-b border-os-border py-1.5 text-left hover:text-os-accent"
            >
              <TypeDot type={n.type} />
              {n.label}
            </button>
          ))}
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {unsure && (
          <button
            type="button"
            title="Open a chat to settle this fact and update company.yaml"
            onClick={() => onConfirm(node)}
            className="rounded-lg bg-os-accent px-3 py-2 text-os-accent-foreground"
          >
            Confirm this fact
          </button>
        )}
        {node.type !== "hub" && (
          <button
            type="button"
            title={isYaml ? "Read the whole company.yaml this fact lives in" : "Read the whole file with its links"}
            onClick={() => onOpenNote?.(node)}
            className={
              unsure
                ? "rounded-lg border border-os-border px-3 py-2 text-os-text"
                : "rounded-lg bg-os-accent px-3 py-2 text-os-accent-foreground"
            }
          >
            {isYaml ? "Open company.yaml" : "Open the full note"}
          </button>
        )}
      </div>
    </div>
  )
}

function MapCanvas({
  graph,
  visible,
  activeId,
  selectedId,
  focusState,
  onHover,
  onSelect,
}: {
  graph: MemoryGraph
  visible: Set<string>
  activeId: string | null
  selectedId: string | null
  focusState: KnowledgeState | null
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
}) {
  const [simNodes, setSimNodes] = useState<SimNode[]>([])
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  // Content-keyed for the same reason as graph-canvas.tsx: a router.refresh()
  // hands over an identical graph in a new object, and relaying out on that
  // would re-scramble the map every 15 seconds.
  const graphKey = useMemo(() => JSON.stringify([graph.nodes, graph.edges]), [graph])

  useEffect(() => {
    // Copies: `graph` may be a shared cached instance, and d3-force writes x/y into what it's given.
    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }))
    const ids = new Set(nodes.map((n) => n.id))
    const links: SimulationLinkDatum<SimNode>[] = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))
    const simulation = forceSimulation(nodes)
      .force("link", forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance(72))
      .force("charge", forceManyBody().strength(-170))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      // Label-sized, as in graph-canvas.tsx: a fixed radius can't separate labels of very different widths.
      .force("collide", forceCollide<SimNode>((d) => Math.max(26, (truncate(d.label).length * CHAR_W) / 2 + 10)))
      .on("tick", () => setSimNodes([...nodes]))
    return () => {
      simulation.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey])

  // React's onWheel is passive, so preventDefault (to stop the page scrolling) needs a native listener.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / rect.width) * WIDTH
      const py = ((e.clientY - rect.top) / rect.height) * HEIGHT
      setView((v) => {
        const k = Math.min(4, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0015)))
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
      })
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [])

  const startPan = (e: ReactPointerEvent<SVGRectElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const pan = (e: ReactPointerEvent<SVGRectElement>) => {
    if (!drag.current || !svgRef.current) return
    const scale = WIDTH / svgRef.current.getBoundingClientRect().width
    const dx = (e.clientX - drag.current.x) * scale
    const dy = (e.clientY - drag.current.y) * scale
    drag.current = { x: e.clientX, y: e.clientY, moved: drag.current.moved || dx !== 0 || dy !== 0 }
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }

  // A click on empty canvas (no drag) clears the selection.
  const endPan = () => {
    if (drag.current && !drag.current.moved) onSelect(null)
    drag.current = null
  }
  const cancelPan = () => {
    drag.current = null
  }

  const lit = litNodes(graph.nodes, graph.edges, activeId, focusState)
  const isLit = (id: string) => !lit || lit.has(id)
  const near = activeId ? lit : null
  const pos = new Map(simNodes.map((n) => [n.id, n]))

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-full w-full"
      role="group"
      aria-label="Map of what the AI knows"
    >
      <rect
        width={WIDTH}
        height={HEIGHT}
        fill="transparent"
        className="cursor-grab active:cursor-grabbing"
        onPointerDown={startPan}
        onPointerMove={pan}
        onPointerUp={endPan}
        onPointerCancel={cancelPan}
        onLostPointerCapture={cancelPan}
      />
      <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        {graph.edges.map((e, i) => {
          const a = pos.get(e.source)
          const b = pos.get(e.target)
          if (!a || !b || !visible.has(a.id) || !visible.has(b.id)) return null
          const on = activeId !== null && (e.source === activeId || e.target === activeId)
          const faded = activeId ? !on : !(isLit(a.id) && isLit(b.id))
          return (
            <line
              key={i}
              x1={a.x ?? 0}
              y1={a.y ?? 0}
              x2={b.x ?? 0}
              y2={b.y ?? 0}
              stroke={on ? "var(--accent)" : "var(--border-strong)"}
              strokeWidth={on ? 1.6 : 1}
              opacity={faded ? 0.15 : 1}
              className="transition-opacity"
            />
          )
        })}
        {simNodes.map((n) => {
          if (!visible.has(n.id)) return null
          const r = n.type === "hub" ? 12 : n.state === "always" ? 9 : 7
          const color = TYPE_COLOR[n.type]
          const strong = n.id === selectedId || (near?.has(n.id) ?? false) || n.id === activeId
          return (
            <g
              key={n.id}
              transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}
              opacity={isLit(n.id) ? 1 : 0.15}
              className="cursor-pointer transition-opacity focus-visible:outline-none"
              onPointerEnter={() => onHover(n.id)}
              onPointerLeave={() => onHover(null)}
              onClick={() => onSelect(n.id)}
              tabIndex={0}
              role="button"
              aria-label={`${TYPE_NAME[n.type]}: ${n.label}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelect(n.id)
                }
              }}
            >
              {n.type === "hub" ? (
                <circle r={r} fill={color} />
              ) : n.state === "unsure" ? (
                <circle r={r} fill="none" stroke="var(--destructive)" strokeWidth={1.6} strokeDasharray="3 2" />
              ) : (
                <>
                  {n.state === "always" && <circle r={r + 6} fill={color} opacity={0.18} />}
                  <circle r={r} fill={color} style={{ opacity: n.state === "always" ? 1 : "var(--mm-lookup-opacity)" }} />
                </>
              )}
              {n.id === selectedId && <circle r={r + 3} fill="none" stroke="var(--accent)" strokeWidth={1} />}
              <text
                y={r + 13}
                textAnchor="middle"
                fontSize={10}
                className="pointer-events-none font-mono"
                fill={strong ? "var(--text)" : "var(--text-2)"}
              >
                {truncate(n.label)}
                <title>{n.label}</title>
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
