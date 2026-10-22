"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force"
import { ASSISTANT_OPEN_EVENT } from "@/components/os/assistant-dock"
import { HUB_FOLDERS } from "@/lib/os/brain/memory-hubs"
import type { KnowledgeState, MemoryGraph, MemoryNode, MemoryNodeType } from "@/lib/os/brain/memory-graph-types"
import { buildLinkIndex } from "@/lib/os/brain/memory-links"
import {
  TYPE_COLOR,
  confirmFactPrompt,
  fitTransform,
  isLandmark,
  litNodes,
  neighbours,
  panInto,
  shouldLabel,
  visibleNodes,
  type View,
} from "./memory-map-state"
import { phase, useAliveMotion } from "./memory-map-motion"
import { MemoryNoteView } from "./memory-note-view"

type SimNode = MemoryNode & SimulationNodeDatum

/** Room around the framed nodes for the labels under them. */
const LABEL_PAD = 60
const MAX_LABEL = 22
/** Mono advance at the 10px label size. */
const CHAR_W = 6
const radius = (n: MemoryNode) => (n.type === "hub" ? 12 : n.state === "always" ? 9 : 7)
/** The round cloud the map packs into: about the area its dots and their spacing need. */
const cloudRadius = (count: number) => 60 + 24 * Math.sqrt(count)
const truncate = (label: string) => (label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label)

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
  initialSelectedId = null,
  initialNote,
}: {
  companyId: string
  graph: MemoryGraph
  /** Lets a static render show the side panel; the page leaves it unset. */
  initialSelectedId?: string | null
  /** Opens straight into the note view, for tests and deep links. */
  initialNote?: { id: string; text: string }
}) {
  const [hidden, setHidden] = useState<Set<MemoryNodeType>>(new Set())
  const [query, setQuery] = useState("")
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? initialNote?.id ?? null)
  const [focusState, setFocusState] = useState<KnowledgeState | null>(null)
  const [full, setFull] = useState(false)
  const [note, setNote] = useState<{ id: string; text: string | null; failed: boolean } | null>(
    initialNote ? { ...initialNote, failed: false } : null
  )
  // Bumped on every open and close, so a slow response for a note the person already left is dropped.
  const noteRequest = useRef(0)

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])
  const visible = useMemo(() => visibleNodes(graph.nodes, hidden, query), [graph, hidden, query])
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  const noteNode = note ? byId.get(note.id) ?? null : null
  const noteOpen = noteNode !== null

  // Built here from the graph's own nodes, so the note's links resolve exactly as the map's edges did.
  const linkIndex = useMemo(() => {
    const files = graph.nodes.filter((n) => n.type !== "hub" && n.type !== "skill" && !n.id.startsWith("yaml:")).map((n) => n.id)
    const skills = graph.nodes.filter((n) => n.type === "skill").map((n) => ({ id: n.id.slice("skill:".length), nodeId: n.id }))
    // Only the hubs this map draws, or a link to an empty folder would point at nothing.
    const hubs = Object.fromEntries(Object.entries(HUB_FOLDERS).filter(([, hub]) => byId.has(hub)))
    return buildLinkIndex(files, skills, hubs)
  }, [graph, byId])

  const always = graph.nodes.filter((n) => n.state === "always" && isFile(n)).map((n) => n.path.split("/").pop())
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

  const confirmFact = (node: MemoryNode) => {
    // The assistant docks beside the page, so leave full page or it opens out of sight.
    setFull(false)
    window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT, { detail: { companyId, prompt: confirmFactPrompt(node) } }))
  }

  // Selecting a node and focusing a stat clear each other, so whichever the person did last is what lights up.
  const select = (id: string | null) => {
    setSelectedId(id)
    if (id) setFocusState(null)
  }

  const closeNote = () => {
    noteRequest.current++
    setNote(null)
  }

  const openNote = (id: string) => {
    const node = byId.get(id)
    if (!node) return
    // A folder has no note of its own: show it on the map instead.
    if (node.type === "hub") {
      closeNote()
      select(id)
      return
    }
    select(id)
    setNote({ id, text: null, failed: false })
    const request = ++noteRequest.current
    // `yaml:` facts carry company.yaml as their path, so they open that file.
    fetch(`/api/brain/note?${new URLSearchParams({ companyId, path: node.path })}`)
      .then(async (res) => {
        const body = (await res.json()) as { text?: unknown }
        if (!res.ok || typeof body.text !== "string") throw new Error("note not readable")
        return body.text
      })
      .then(
        (text) => request === noteRequest.current && setNote({ id, text, failed: false }),
        () => request === noteRequest.current && setNote({ id, text: null, failed: true })
      )
  }

  // The one window Esc handler: it leaves the note first (keeping the node selected), then clears the selection, then leaves full page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc in the search box (or anything editable) belongs to that field.
      const t = e.target as HTMLElement | null
      if (e.defaultPrevented || t?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return
      if (e.key !== "Escape") return
      if (noteOpen) {
        noteRequest.current++
        setNote(null)
      } else if (selectedId) setSelectedId(null)
      else setFull(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [noteOpen, selectedId])

  return (
    // Full page lifts the map (and any note opened from it) over the whole window, above the assistant dock.
    <div className={full ? "fixed inset-0 z-[55] flex flex-col bg-os-bg" : "contents"}>
      {noteNode && note && (
        <MemoryNoteView
          graph={graph}
          node={noteNode}
          text={note.text}
          failed={note.failed}
          index={linkIndex}
          onOpen={openNote}
          onBack={closeNote}
        />
      )}
      {/* Hidden, not unmounted, under the note: Esc comes back to the same layout, pan and zoom. */}
      <div className={`${noteOpen ? "hidden" : "flex"} h-full min-h-[560px] flex-col text-[13px] text-os-text`}>
        <div className="flex flex-wrap items-start gap-2.5 border-b border-os-border px-4 py-3">
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
          <div className="ml-auto flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                title={full ? "Go back to the normal page (Esc)" : "Fill the whole window with the map"}
                aria-pressed={full}
                onClick={() => setFull((f) => !f)}
                className="flex items-center gap-1.5 rounded-lg border border-os-border bg-os-surface px-2.5 py-1.5 text-xs text-os-text hover:border-os-text/40"
              >
                <span aria-hidden>{full ? "⤡" : "⤢"}</span>
                {full ? "Exit full page" : "Full page"}
              </button>
              <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search what the AI knows…"
              title="Find any fact, note, decision or skill"
              aria-label="Search what the AI knows"
              className="w-60 rounded-lg border border-os-border bg-os-surface px-2.5 py-1.5 text-os-text placeholder:text-os-muted"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-1.5">
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
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            {graph.nodes.length ? (
              <MapCanvas
                // A fresh canvas for full page and back: it measures the new box and frames the map in it.
                key={full ? "full" : "page"}
                graph={graph}
                visible={visible}
                query={query}
                activeId={hoverId ?? selectedId}
                selectedId={selectedId}
                focusState={focusState}
                paused={noteOpen}
                onHover={setHoverId}
                onSelect={select}
              />
            ) : (
              <p className="p-6 text-sm text-os-muted">Nothing saved yet.</p>
            )}
            {graph.nodes.length > 0 && (
              <p className="pointer-events-none absolute bottom-3.5 left-4 rounded bg-os-surface/85 px-2 py-0.5 text-xs text-os-muted">
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
                onOpenNote={openNote}
              />
            ) : (
              <p className="text-os-muted">Click a dot to see what the AI knows about it.</p>
            )}
          </aside>
        </div>
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
  onOpenNote: (id: string) => void
}) {
  const unsure = node.state === "unsure"
  const isYaml = node.id.startsWith("yaml:")
  const badge = node.type === "skill" ? { ...BADGE.lookup, text: "The AI reads this skill when a task calls for it." } : BADGE[node.state]
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
            onClick={() => onOpenNote(node.id)}
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
  query,
  activeId,
  selectedId,
  focusState,
  paused,
  onHover,
  onSelect,
}: {
  graph: MemoryGraph
  visible: Set<string>
  query: string
  activeId: string | null
  selectedId: string | null
  focusState: KnowledgeState | null
  /** True while the map is hidden under a note: nothing to animate. */
  paused: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
}) {
  const [simNodes, setSimNodes] = useState<SimNode[]>([])
  const [cloud, setCloud] = useState(0)
  const layerRef = useRef<SVGGElement>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  // Unknown until measured: the server and the first client render draw no
  // svg at all, so there is nothing to mismatch on hydration.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const sizeRef = useRef(size)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    sizeRef.current = size
  }, [size])

  // viewBox = the measured box, so screen and svg units are 1:1 and pan and zoom need no rescaling.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => {
      const { width, height } = box.getBoundingClientRect()
      // Hidden under the note view the box measures 0; keep the last size so nothing refits.
      if (width > 0 && height > 0) setSize((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  // Content-keyed for the same reason as graph-canvas.tsx: a router.refresh()
  // hands over an identical graph in a new object, and relaying out on that
  // would re-scramble the map every 15 seconds.
  const graphKey = useMemo(() => JSON.stringify([graph.nodes, graph.edges]), [graph])

  useEffect(() => {
    // Copies: `graph` may be a shared cached instance, and d3-force writes x/y into what it's given.
    const nodes: SimNode[] = graph.nodes.map((n) => ({ ...n }))
    const ids = new Set(nodes.map((n) => n.id))
    const hubs = new Set(nodes.filter((n) => n.type === "hub").map((n) => n.id))
    const links: SimulationLinkDatum<SimNode>[] = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))
    const isHubLink = (l: SimulationLinkDatum<SimNode>) =>
      hubs.has((l.source as SimNode).id) || hubs.has((l.target as SimNode).id)
    // Anything past the cloud's edge is pulled back in, so the whole map reads as one round brain.
    const R = cloudRadius(nodes.length)
    const round = (alpha: number) => {
      for (const n of nodes) {
        const d = Math.hypot(n.x ?? 0, n.y ?? 0)
        if (d <= R) continue
        const pull = ((d - R) / d) * alpha
        n.vx = (n.vx ?? 0) - (n.x ?? 0) * pull
        n.vy = (n.vy ?? 0) - (n.y ?? 0) * pull
      }
    }
    // Laid out once, off screen: no settling animation to sit through. The drift afterwards is useAliveMotion's.
    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
          .id((d) => d.id)
          .distance((l) => (isHubLink(l) ? 30 : 72))
      )
      .force("charge", forceManyBody<SimNode>().strength((d) => (d.type === "hub" ? -500 : -50)))
      .force("x", forceX<SimNode>(0).strength(0.05))
      .force("y", forceY<SimNode>(0).strength(0.05))
      // Label-sized only where a label shows at every zoom; the rest pack tight so clusters read as clusters.
      .force(
        "collide",
        forceCollide<SimNode>((d) => (isLandmark(d) ? Math.max(26, (truncate(d.label).length * CHAR_W) / 2 + 10) : radius(d) + 4))
      )
      .force("round", round)
      .stop()
    simulation.tick(300)
    setSimNodes(nodes)
    setCloud(R)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey])

  const pos = useMemo(() => new Map(simNodes.map((n) => [n.id, n])), [simNodes])
  const colorOf = useCallback((id: string) => TYPE_COLOR[pos.get(id)?.type ?? "hub"], [pos])
  useAliveMotion(layerRef, pos, colorOf, paused)
  const matches = useMemo(
    () => (query.trim() ? new Set([...visible].filter((id) => pos.get(id)?.type !== "hub")) : null),
    [query, visible, pos]
  )

  // What to frame: a stat's lit nodes, else the search matches (hubs left out), else everything shown.
  const fitIds = useMemo(() => {
    const focused = focusState ? litNodes(graph.nodes, graph.edges, null, focusState) : null
    if (focused) return [...focused].filter((id) => visible.has(id))
    return [...(matches ?? visible)]
  }, [graph, focusState, matches, visible])
  const fitKey = fitIds.join("\n")
  const measured = size !== null

  useEffect(() => {
    const box = sizeRef.current
    if (!box) return
    const points = fitIds.flatMap((id) => pos.get(id) ?? []).map((n) => ({ x: n.x ?? 0, y: n.y ?? 0 }))
    const next = fitTransform(points, box.w, box.h, LABEL_PAD)
    if (next) setView(next)
    // Refit only when the layout or the framed set changes: never on an identical refresh or a resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, fitKey, measured])

  // A node picked from the side panel or a link is panned into view, at the current zoom.
  useEffect(() => {
    const box = sizeRef.current
    const n = selectedId ? pos.get(selectedId) : undefined
    if (!box || !n) return
    setView((v) => panInto({ x: n.x ?? 0, y: n.y ?? 0 }, v, box.w, box.h, LABEL_PAD))
  }, [selectedId, pos, measured])

  // React's onWheel is passive, so preventDefault (to stop the page scrolling) needs a native listener.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = box.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setView((v) => {
        const k = Math.min(4, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0015)))
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
      })
    }
    box.addEventListener("wheel", onWheel, { passive: false })
    return () => box.removeEventListener("wheel", onWheel)
  }, [])

  const startPan = (e: ReactPointerEvent<SVGRectElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const pan = (e: ReactPointerEvent<SVGRectElement>) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
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
  const labelCtx = { k: view.k, selectedId, near, matches }

  return (
    <div ref={boxRef} className="h-full w-full overflow-hidden">
      {size && (
        <svg
          viewBox={`0 0 ${size.w} ${size.h}`}
          width={size.w}
          height={size.h}
          className="block"
          role="group"
          aria-label="Map of what the AI knows"
        >
          <rect
            width={size.w}
            height={size.h}
            fill="transparent"
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={startPan}
            onPointerMove={pan}
            onPointerUp={endPan}
            onPointerCancel={cancelPan}
            onLostPointerCapture={cancelPan}
          />
          <defs>
            <radialGradient id="mm-cloud">
              <stop offset="0" stopColor="var(--text)" stopOpacity={0.06} />
              <stop offset="1" stopColor="var(--text)" stopOpacity={0} />
            </radialGradient>
          </defs>
          <g ref={layerRef} transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {cloud > 0 && <circle r={cloud + LABEL_PAD} fill="url(#mm-cloud)" className="pointer-events-none" />}
            {graph.edges.map((e, i) => {
              const a = pos.get(e.source)
              const b = pos.get(e.target)
              if (!a || !b || !visible.has(a.id) || !visible.has(b.id)) return null
              const on = activeId !== null && (e.source === activeId || e.target === activeId)
              const faded = activeId ? !on : !(isLit(a.id) && isLit(b.id))
              return (
                <line
                  key={i}
                  data-edge=""
                  data-source={a.id}
                  data-target={b.id}
                  x1={a.x ?? 0}
                  y1={a.y ?? 0}
                  x2={b.x ?? 0}
                  y2={b.y ?? 0}
                  stroke={on ? "var(--accent)" : "var(--border-strong)"}
                  strokeWidth={on ? 1.6 : 1}
                  opacity={faded ? 0.15 : 1}
                  className="motion-safe:transition-opacity"
                />
              )
            })}
            {simNodes.map((n) => {
              if (!visible.has(n.id)) return null
              const r = radius(n)
              const color = TYPE_COLOR[n.type]
              const strong = n.id === selectedId || (near?.has(n.id) ?? false) || n.id === activeId
              return (
                <g
                  key={n.id}
                  data-node={n.id}
                  transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}
                  opacity={isLit(n.id) ? 1 : 0.15}
                  className="cursor-pointer motion-safe:transition-opacity focus-visible:outline-none"
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
                    <circle r={r} fill="none" stroke="var(--destructive)" strokeWidth={1.6} strokeDasharray="3 2" className="mm-flicker" style={{ animationDelay: `-${phase(n.id) * 3}s` }} />
                  ) : (
                    <>
                      {n.state === "always" && <circle r={r + 6} fill={color} opacity={0.18} className="mm-breathe" style={{ animationDelay: `-${phase(n.id) * 4}s` }} />}
                      <circle r={r} fill={color} style={{ opacity: n.state === "always" ? 1 : "var(--mm-lookup-opacity)" }} />
                    </>
                  )}
                  {n.id === selectedId && <circle r={r + 3} fill="none" stroke="var(--accent)" strokeWidth={1} />}
                  {shouldLabel(n, labelCtx) ? (
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
                  ) : (
                    <title>{n.label}</title>
                  )}
                </g>
              )
            })}
            <g data-sparks="" className="pointer-events-none" />
          </g>
        </svg>
      )}
    </div>
  )
}
