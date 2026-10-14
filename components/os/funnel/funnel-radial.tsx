"use client"

import React, { useState } from "react"
import type { FunnelRadialModel } from "@/lib/os/departments/adapters/funnel-adapter"
import { FunnelNodeCard } from "./funnel-node-card"

const S = 540
const C = S / 2
const RINGS = [210, 165, 120, 75, 30]

const STAGE_LABELS = ["First touch", "Engaged", "Nurtured", "Opted in", "Converted"]

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

export function FunnelRadial({
  model,
  initialLeadId,
}: {
  model: FunnelRadialModel
  initialLeadId?: string | null
}) {
  const [selectedId, setSelectedId] = useSafeState<string | null>(initialLeadId ?? null)
  const [hoverId, setHoverId] = useSafeState<string | null>(null)

  React.useEffect(() => {
    if (initialLeadId !== undefined) {
      setSelectedId(initialLeadId)
    }
  }, [initialLeadId])

  const selectedNode = model.nodes.find((n) => n.id === selectedId)

  return (
    <div className="relative flex h-[460px] w-full items-center justify-center overflow-hidden rounded-lg border border-os-border bg-os-bg select-none">
      <svg viewBox={`0 0 ${S} ${S}`} className="h-full w-full max-w-[500px]">
        {/* Concentric Rings */}
        {RINGS.map((r, i) => (
          <circle
            key={i}
            cx={C}
            cy={C}
            r={r}
            fill={i === 4 ? "var(--os-surface2, rgba(255,255,255,0.05))" : "none"}
            stroke="var(--os-border, rgba(255,255,255,0.08))"
            strokeWidth={1}
            strokeDasharray={i < 4 ? "3 3" : undefined}
          />
        ))}

        {/* Ring Labels */}
        {RINGS.slice(0, 4).map((r, i) => (
          <text
            key={i}
            x={C}
            y={C - r + 12}
            textAnchor="middle"
            className="fill-os-dim font-mono text-[8.5px] uppercase tracking-widest"
          >
            {STAGE_LABELS[i]}
          </text>
        ))}

        {/* Center Purchase Label */}
        <text
          x={C}
          y={C + 3}
          textAnchor="middle"
          className="fill-os-ok font-mono text-[9px] font-bold uppercase tracking-wider"
        >
          WON
        </text>

        {/* Nodes */}
        {model.nodes.map((n, idx) => {
          const ringRadius = RINGS[n.currentRing] ?? RINGS[0]
          const totalSegments = model.segments.length
          const segAngle = (2 * Math.PI) / totalSegments
          const baseAngle = n.segment * segAngle + (segAngle / 2)
          const angleJitter = ((idx % 7) - 3) * 0.08
          const rad = baseAngle + angleJitter
          const x = C + Math.cos(rad) * (ringRadius - 5)
          const y = C + Math.sin(rad) * (ringRadius - 5)

          const isSelected = selectedId === n.id
          const isHovered = hoverId === n.id

          return (
            <g
              key={n.id}
              className="cursor-pointer"
              onClick={() => setSelectedId(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <circle
                cx={x}
                cy={y}
                r={isSelected || isHovered ? n.radius + 3 : n.radius}
                fill={n.state === "converted" ? "var(--os-ok, #10b981)" : "var(--os-accent, #3df08c)"}
                opacity={isSelected ? 1 : 0.85}
                stroke={isSelected ? "#fff" : "none"}
                strokeWidth={1.5}
              >
                <title>{`${n.name} · ${n.likelihood}%`}</title>
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
