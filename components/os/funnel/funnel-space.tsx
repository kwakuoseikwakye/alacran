"use client"

import React, { useState } from "react"
import {
  FUNNEL_STAGES,
  type FunnelSpaceNode,
  type FunnelSummary,
} from "@/lib/os/departments/adapters/funnel-adapter"
import { FunnelNodeCard } from "./funnel-node-card"

const W = 1100
const H = 460
const CY = H / 2 - 14
const HUB_X0 = 100
const HUB_GAP = (W - 200) / (FUNNEL_STAGES.length - 1)
const hubX = (i: number) => HUB_X0 + i * HUB_GAP
const hubR = (i: number) => (i === FUNNEL_STAGES.length - 1 ? 34 : 24)

const STAGE_COLORS = [
  "var(--os-accent, #3df08c)",
  "#38bdf8",
  "#a78bfa",
  "#f59e0b",
  "#10b981",
]

const GOLDEN = 2.399963

function nodePos(n: FunnelSpaceNode, i: number): { x: number; y: number } {
  const a = i * GOLDEN
  const r = hubR(n.currentHub) + 8 + ((1 - n.likelihood / 100) * 22 + (i % 5) * 4)
  return {
    x: hubX(n.currentHub) + Math.cos(a) * r,
    y: CY + Math.sin(a) * r * 0.85,
  }
}

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

export function FunnelSpace({
  nodes,
  summary,
  initialLeadId,
}: {
  nodes: FunnelSpaceNode[]
  summary: FunnelSummary
  initialLeadId?: string | null
}) {
  const [selectedId, setSelectedId] = useSafeState<string | null>(initialLeadId ?? null)
  const [hoverId, setHoverId] = useSafeState<string | null>(null)

  React.useEffect(() => {
    if (initialLeadId !== undefined) {
      setSelectedId(initialLeadId)
    }
  }, [initialLeadId])

  const selectedNode = nodes.find((n) => n.id === selectedId)

  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-lg border border-os-border bg-os-bg select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
        {/* Horizontal Spine Track */}
        <line
          x1={HUB_X0}
          y1={CY}
          x2={HUB_X0 + 4 * HUB_GAP}
          y2={CY}
          stroke="var(--os-border, rgba(255,255,255,0.08))"
          strokeWidth={2}
          strokeDasharray="4 4"
        />

        {/* Stage Hubs */}
        {FUNNEL_STAGES.map((s, i) => {
          const x = hubX(i)
          const r = hubR(i)
          const count = nodes.filter((n) => n.currentHub === i).length
          const stageSummary = summary.stages[i]

          return (
            <g key={s.id}>
              {/* Hub Outer Ring */}
              <circle
                cx={x}
                cy={CY}
                r={r}
                fill="var(--os-surface, #111)"
                stroke={STAGE_COLORS[i]}
                strokeWidth={1.5}
                opacity={0.8}
              />
              {/* Hub Count */}
              <text
                x={x}
                y={CY + 5}
                textAnchor="middle"
                className="fill-os-text font-mono text-[13px] font-bold"
              >
                {count}
              </text>
              {/* Hub Label */}
              <text
                x={x}
                y={CY + r + 20}
                textAnchor="middle"
                className="fill-os-muted font-mono text-[10.5px] uppercase tracking-[0.14em]"
              >
                {s.label}
              </text>
              {/* Conversion Rate from Previous */}
              {stageSummary?.conversionFromPrev != null && (
                <text
                  x={x - HUB_GAP / 2}
                  y={CY - 12}
                  textAnchor="middle"
                  className="fill-os-dim font-mono text-[9px] tracking-wide"
                >
                  {stageSummary.conversionFromPrev}% →
                </text>
              )}
            </g>
          )
        })}

        {/* Lead Nodes */}
        {nodes.map((n, i) => {
          const { x, y } = nodePos(n, i)
          const isSelected = selectedId === n.id
          const isHovered = hoverId === n.id
          const color =
            n.state === "converted"
              ? "var(--os-ok, #10b981)"
              : n.decay > 0
              ? `color-mix(in oklab, var(--os-err, #f43f5e) ${Math.round(
                  Math.sqrt(n.decay) * 85
                )}%, ${STAGE_COLORS[n.currentHub]})`
              : STAGE_COLORS[n.currentHub]

          return (
            <g
              key={n.id}
              className="cursor-pointer transition-transform"
              onClick={() => setSelectedId(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <circle
                cx={x}
                cy={y}
                r={isSelected || isHovered ? n.radius + 3 : n.radius}
                fill={color}
                opacity={isSelected ? 1 : 0.85}
                stroke={isSelected ? "#fff" : "none"}
                strokeWidth={1.5}
              >
                <title>{`${n.name} · ${n.likelihood}% · ${n.daysSinceLastTouch}d quiet`}</title>
              </circle>
            </g>
          )
        })}
      </svg>

      {/* Dossier Card Overlay */}
      {selectedNode && (
        <FunnelNodeCard node={selectedNode} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
