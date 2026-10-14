"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PersonaCard } from "@/components/os/personas/persona-card";
import { PersonaBrainGraph } from "@/components/os/personas/persona-brain-graph";
import type { Persona } from "@/lib/os/schemas/personas";

function useSafeState<T>(
  initial: T | (() => T),
): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial);
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial;
    return [val, () => {}];
  }
}

function useSafeEffect(
  effect: React.EffectCallback,
  deps?: React.DependencyList,
) {
  try {
    useEffect(effect, deps);
  } catch {
    // headless environment without dispatcher
  }
}

/** One persona at a time — click (or ← / →) through all operator archetypes. */
export function PersonasViewer({ personas }: { personas: Persona[] }) {
  const [i, setI] = useSafeState(0);
  const n = personas.length;
  const go = (dir: number) => setI((c) => (c + dir + n) % n);
  const current = personas[i];

  useSafeEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  if (!current) return null;

  return (
    <div>
      {/* stepper controls — arrows are a fixed pair so you can repeat-click
          without chasing them; the changing label sits to their right. */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => go(-1)}
            aria-label="Previous persona"
            className="flex h-9 w-9 items-center justify-center rounded-sm-t border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Next persona"
            className="flex h-9 w-9 items-center justify-center rounded-sm-t border border-os-border text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-os-dim">
            <span style={{ color: current.accent }}>
              {String(i + 1).padStart(2, "0")}
            </span>{" "}
            / {String(n).padStart(2, "0")}
          </div>
          <div className="truncate text-[13px] font-semibold text-os-text">
            {current.name}
          </div>
        </div>

        {/* jump rail */}
        <div className="ml-auto flex flex-wrap justify-end gap-1.5">
          {personas.map((p, idx) => {
            const active = idx === i;
            return (
              <button
                key={p.id}
                onClick={() => setI(idx)}
                title={p.name}
                className={`flex items-center gap-1.5 rounded-sm-t border px-2 py-1 font-mono text-[10px] transition-colors ${
                  active
                    ? "border-os-border-strong text-os-text"
                    : "border-os-border text-os-dim hover:text-os-muted"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: active
                      ? p.accent
                      : "var(--text-3, rgba(255,255,255,0.2))",
                  }}
                />
                {String(idx + 1).padStart(2, "0")}
              </button>
            );
          })}
        </div>
      </div>

      {/* split view: the card on the LEFT, the persona's G-Brain knowledge
          graph on the RIGHT — same constellation shape as the real /brain, built
          from this persona's own departments + agents */}
      <div
        key={current.id}
        className="persona-in grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]"
      >
        <PersonaCard p={current} cover={false} />
        <div
          className="flex h-[600px] flex-col overflow-hidden rounded-lg-t border border-os-border bg-os-surface lg:sticky lg:top-4 lg:h-[calc(100dvh-11rem)] lg:min-h-[560px]"
          style={{ borderTop: `2px solid ${current.accent}` }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-os-border px-4 py-2.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-os-dim">
              G-Brain · knowledge graph
            </span>
            <span className="font-mono text-[9.5px] text-os-dim">
              {current.pillars.length} depts ·{" "}
              {current.pillars.reduce((s, p) => s + p.agents.length, 0)} agents
            </span>
          </div>
          <div className="min-h-0 flex-1 p-2">
            <PersonaBrainGraph persona={current} />
          </div>
        </div>
      </div>
    </div>
  );
}
