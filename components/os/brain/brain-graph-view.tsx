"use client"

import React, { useState, type ComponentProps } from "react"
import dynamic from "next/dynamic"
import type { KnowledgeGraph as KnowledgeGraphType } from "./knowledge-graph"

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

/**
 * The two graph engines are the heaviest client bundles in the app
 * (KnowledgeGraph alone is ~114KB of source pulling d3-force). They load
 * lazily, client-only, behind dimension-matched skeletons.
 */
const KnowledgeGraph = dynamic(() => import("./knowledge-graph").then((m) => m.KnowledgeGraph), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="h-[680px] min-w-0 flex-1 animate-pulse rounded-lg border border-os-border bg-os-surface" />
      <div className="hidden shrink-0 rounded-lg border border-os-border bg-os-surface lg:block lg:h-[680px] lg:w-72" />
    </div>
  ),
})

const NeuralGraph = dynamic(() => import("./neural-graph").then((m) => m.NeuralGraph), {
  ssr: false,
  loading: () => (
    <div
      className="w-full animate-pulse overflow-hidden rounded-lg border border-os-border bg-os-surface"
      style={{ aspectRatio: "1200 / 640" }}
    />
  ),
})

export type BrainGraphViewProps = ComponentProps<typeof KnowledgeGraphType>

/**
 * View switch for the /brain knowledge graph: the radial six-pillar wheel
 * (default) or the horizontal neural-network projection of the same data.
 */
export function BrainGraphView({ fill, ...props }: BrainGraphViewProps) {
  const [view, setView] = useSafeState<"radial" | "neural">("radial")

  return (
    <div className={fill ? "flex h-full flex-col" : undefined}>
      <div className="mb-2 flex shrink-0 items-center gap-1">
        {(
          [
            { id: "radial", label: "Map", hint: "Teams around the centre" },
            { id: "neural", label: "Flow", hint: "The same company, left to right" },
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`rounded-md border px-3 py-1 text-xs transition-colors ${
              view === v.id
                ? "border-os-accent text-os-accent"
                : "border-os-border text-os-dim hover:text-os-muted"
            }`}
            aria-pressed={view === v.id}
            title={v.hint}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className={fill ? "min-h-0 flex-1" : undefined}>
        {view === "radial" ? (
          <KnowledgeGraph fill={fill} {...props} />
        ) : (
          <NeuralGraph
            graph={props.graph}
            agents={props.agents}
            departments={props.departments}
            people={props.people}
            tasks={props.tasks}
            runsByAgent={props.runsByAgent}
          />
        )}
      </div>
    </div>
  )
}
