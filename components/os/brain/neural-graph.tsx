import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Agent, AgentRun, Department, Person, SopTask } from '@/lib/os/brain/types';
import { graphDirectory, toolSlugOf, type KnowledgeGraph as KGData, type DirectoryGroup } from '@/lib/os/brain/knowledge-graph';
import { neuralLayout, LAYER_X, NEURAL_H, NEURAL_W, type NeuralStrand } from '@/lib/os/brain/neural-layout';
import { NeuralDetail } from './neural-detail';
import { GraphDirectory } from './graph-directory';

/**
 * The horizontal "neural network" view of the SAME knowledge graph: tools as
 * the labeled input layer, then workers → SOP tasks → pillars → the Notes
 * core as the single output neuron. Drawn on the app's own surface in one
 * neutral strand colour (opacity by weight), with a hover spotlight that zooms
 * the camera onto whatever the cursor is on while everything else dims. The
 * directory sits beside the graph, never over it. Still and quiet until you
 * point at it. Pure SVG — no physics loop, no rAF.
 */

// One neutral strand colour on the app's own surface; the sign of a weight is
// not something a person reading this can act on, so it is not drawn.
const STRAND_COLOR = 'var(--text-3)';
const DOT_COLOR = 'var(--text)';

const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** short kind tag for the hover readout (from the node-id prefix) */
const hoverKind = (id: string): string => {
  if (id.startsWith('emp:')) return 'AI agent';
  if (id.startsWith('person:')) return 'person';
  if (id.startsWith('task:')) return 'procedure';
  if (id.startsWith('tool:')) return 'tool';
  if (id.startsWith('team:')) return 'team';
  return 'company notes';
};

const truncateLabel = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial);
  } catch {
    const val = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [val, () => {}];
  }
}

export function NeuralGraph({
  graph, agents = [], departments = [], people = [], tasks = [], runsByAgent = {},
}: {
  graph: KGData;
  agents?: Agent[];
  departments?: Department[];
  people?: Person[];
  tasks?: SopTask[];
  runsByAgent?: Record<string, AgentRun>;
}) {
  const { layers, pos, strands, reports } = useMemo(() => neuralLayout(graph), [graph]);
  const labelById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.label])), [graph]);
  const [hoverId, setHoverId] = useSafeState<string | null>(null);
  // The drawing is 1200 units wide but shown at whatever width the page gives
  // it, so a fixed font size in units shrinks with the window. Measure the
  // scale and size text in units that come out at a steady on-screen size.
  const boxRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setK(el.clientWidth / NEURAL_W || 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fs = (px: number) => px / k;
  const [selectedId, setSelectedId] = useSafeState<string | null>(null);

  // the everything-index, shared with the graph view. Hover a row to spotlight
  // its neuron (camera zoom + strand highlight) with no click; click opens its
  // detail. Same node-id mapping the graph view uses (tools go by slug).
  const directory = useMemo(
    () => graphDirectory(agents, departments, people, tasks, graph),
    [agents, departments, people, tasks, graph],
  );
  const nodeIdForRow = (kind: DirectoryGroup['kind'], id: string) =>
    kind === 'tool'
      ? graph.nodes.find((n) => n.kind === 'tool' && toolSlugOf(n.id) === id)?.id ?? null
      : id;
  const hoverFromDirectory = (kind: DirectoryGroup['kind'], id: string | null) =>
    setHoverId(id ? nodeIdForRow(kind, id) : null);
  const pickFromDirectory = (kind: DirectoryGroup['kind'], id: string) =>
    setSelectedId(nodeIdForRow(kind, id));

  const incident = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    for (const s of strands) {
      if (s.source === hoverId) set.add(s.target);
      if (s.target === hoverId) set.add(s.source);
    }
    return set;
  }, [hoverId, strands]);

  // camera: zoom toward the hovered neuron, ease back on leave
  const hoverPos = hoverId ? pos.get(hoverId) : null;
  const camera = hoverPos
    ? { transform: `scale(1.55)`, transformOrigin: `${hoverPos.x}px ${hoverPos.y}px` }
    : { transform: 'scale(1)', transformOrigin: `${NEURAL_W / 2}px ${NEURAL_H / 2}px` };

  // each edge renders as a BUNDLE of frayed sub-strands — the dense, silky,
  // organic web of the reference: thousands of overlapping filaments instead
  // of one clinical line per connection
  const STRANDS_PER_EDGE = 5;
  const strandPath = (s: NeuralStrand, k: number) => {
    const a = pos.get(s.source)!;
    const b = pos.get(s.target)!;
    const h = hashStr(`${s.source}→${s.target}#${k}`);
    const fray = ((h % 15) - 7) * 0.9; // endpoint fray so bundles read as rope
    const bow = ((((h >> 4) % 61) - 30) / 30) * 42;
    const mx = (a.x + b.x) / 2 + (((h >> 10) % 31) - 15);
    return `M ${a.x} ${a.y + fray * 0.4} C ${mx} ${a.y + bow}, ${mx} ${b.y - bow}, ${b.x} ${b.y + fray * 0.25}`;
  };

  const strandOpacity = (s: NeuralStrand, base: number) => {
    if (!incident) return base;
    return s.source === hoverId || s.target === hoverId ? Math.min(1, base * 5 + 0.3) : base * 0.15;
  };

  return (
    <div className="flex flex-col gap-3 min-[821px]:flex-row">
    <div
      ref={boxRef}
      className="relative min-w-0 flex-1 overflow-hidden rounded-lg-t border border-os-border bg-os-surface"
      onMouseLeave={() => setHoverId(null)}
    >
      <svg viewBox={`0 0 ${NEURAL_W} ${NEURAL_H}`} className="block w-full" role="img" aria-label="Company flow view">

        {/* camera rig: everything below zooms toward the hovered neuron */}
        <g style={{ ...camera, transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1), transform-origin 700ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
          {/* the web — every strand drawn twice (wide faint pass, thin core pass) */}
          <g>
              {strands.map((s) => {
                const a = pos.get(s.source)!;
                // brightest near the inputs, thinning toward the output
                const layerFade = 1 - (a.x / NEURAL_W) * 0.45;
                const base = (0.1 + Math.abs(s.weight) * 0.3) * layerFade;
                const tint = STRAND_COLOR;
                const o = strandOpacity(s, base);
                return (
                  <g key={`${s.source}→${s.target}`} opacity={o} style={{ transition: 'opacity 300ms' }}>
                    {Array.from({ length: STRANDS_PER_EDGE }, (_, k) => {
                      const d = strandPath(s, k);
                      return (
                        <g key={k}>
                          {k === 0 && <path d={d} fill="none" stroke={tint} strokeWidth={2.6} opacity={0.3} />}
                          <path d={d} fill="none" stroke={tint} strokeWidth={0.55} opacity={0.8} />
                        </g>
                      );
                    })}
                  </g>
                );
              })}
          </g>

          {/* same-layer reporting lines — faint vertical arcs */}
          {reports.map((r) => {
            const a = pos.get(r.source);
            const b = pos.get(r.target);
            if (!a || !b) return null;
            const dim = incident && !(incident.has(r.source) && incident.has(r.target));
            return (
              <path
                key={`${r.source}→${r.target}`}
                d={`M ${a.x} ${a.y} C ${a.x - 34} ${(a.y + b.y) / 2}, ${b.x - 34} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`}
                fill="none"
                stroke="var(--text-3)"
                strokeWidth={0.8}
                opacity={dim ? 0.05 : 0.22}
                style={{ transition: 'opacity 300ms' }}
              />
            );
          })}

          {/* neurons */}
          {layers.map((layer) =>
            layer.nodeIds.map((id) => {
              const p = pos.get(id)!;
              const isSelf = layer.kind === 'self';
              const dimmed = incident ? !incident.has(id) : false;
              const r = isSelf ? 10 : layer.kind === 'team' ? 5 : 2.6;
              return (
                <g
                  key={id}
                  transform={`translate(${p.x},${p.y})`}
                  opacity={dimmed ? 0.15 : 1}
                  style={{ transition: 'opacity 300ms', cursor: 'pointer' }}
                  onMouseEnter={() => setHoverId(id)}
                  onClick={() => setSelectedId((cur) => (cur === id ? null : id))}
                >
                  <title>{labelById.get(id) ?? id}</title>
                  <circle r={Math.max(8, r + 5)} fill="transparent" />
                  <circle r={r} fill={isSelf ? 'var(--kg-mem, #e35c35)' : DOT_COLOR} fillOpacity={isSelf ? 1 : 0.92} />
                  {isSelf && <circle r={r + 5} fill="none" stroke="var(--kg-mem, #e35c35)" strokeWidth={0.8} opacity={0.5} />}
                  {/* the three left-hand columns are named, unless there are too many to read */}
                  {(layer.kind === 'tool' || layer.kind === 'worker' || layer.kind === 'task') && layer.nodeIds.length <= 16 && (
                    <text className="kg-halo" x={-10} textAnchor="end" dominantBaseline="middle" fontSize={fs(12)} fill="var(--text-2)">
                      {truncateLabel(labelById.get(id) ?? id, 22)}
                    </text>
                  )}
                  {layer.kind === 'team' && (
                    <text className="kg-halo" x={10} dominantBaseline="middle" fontSize={fs(13)} fontWeight={600} fill="var(--text)">
                      {labelById.get(id)}
                    </text>
                  )}
                  {isSelf && (
                    <text className="kg-halo" y={26} textAnchor="middle" fontSize={fs(13)} fontWeight={600} fill="var(--kg-mem, #e35c35)">
                      Notes
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </g>
      </svg>

      {/* stage labels — just the word for each lane; they fade back while a
          node is hovered so the top readout reads cleanly */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-3 transition-opacity duration-200 ${
          hoverId ? 'opacity-20' : 'opacity-100'
        }`}
      >
        {/* each header sits over its own column; a lane with nothing in it gets none */}
        {layers.map((layer, li) =>
          layer.nodeIds.length === 0 ? null : (
            <div
              key={layer.kind}
              className="absolute -translate-x-1/2 whitespace-nowrap text-xs font-medium text-os-muted"
              style={{ left: `${(LAYER_X[li] / NEURAL_W) * 100}%` }}
            >
              {layer.name}
            </div>
          ),
        )}
      </div>

      {/* hover readout — what the cursor is on, listed at the top, no click */}
      {hoverId && (
        <div className="pointer-events-none absolute inset-x-0 top-2.5 z-30 flex justify-center">
          <div className="flex items-baseline gap-2 rounded-md bg-os-surface/90 px-2.5 py-1">
            <span className="text-sm font-semibold text-os-text">{labelById.get(hoverId) ?? hoverId}</span>
            <span className="text-xs text-os-dim">{hoverKind(hoverId)}</span>
          </div>
        </div>
      )}

      {/* the same detail panels as the radial view, opened by clicking a
          neuron — absolute overlay so the network never reflows */}
      {selectedId && (
        <div className="absolute inset-y-0 right-0 z-10 w-80 border-l border-os-border-strong bg-os-bg/95 backdrop-blur">
          <NeuralDetail
            nodeId={selectedId}
            graph={graph}
            agents={agents}
            departments={departments}
            people={people}
            tasks={tasks}
            runsByAgent={runsByAgent}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

    </div>

    {/* the everything-index, same list as the map — beside the graph, not on
        it. Hover a row to spotlight its neuron, click to open its detail. */}
    <div className="relative hidden w-72 shrink-0 min-[821px]:block">
      <div className="absolute inset-0">
        <GraphDirectory groups={directory} onPick={pickFromDirectory} onHover={hoverFromDirectory} className="h-full" />
      </div>
    </div>
  </div>
  );
}
