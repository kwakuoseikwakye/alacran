'use client';

import React, { useState } from 'react';
import type { RoadmapFile } from '@/lib/os/schemas/roadmap';
import {
  groupMilestonesByQuarter,
  groupMilestonesByHorizon,
  computeRoadmapSummary,
} from '@/lib/os/roadmap/grouping';
import { PhaseCard } from './phase-card';
import { MilestoneCard } from './milestone-card';
import { Calendar, Layers, Plus } from 'lucide-react';
import { AddMilestoneModal } from '@/components/os/department/modals';

export function resolvePerspectiveLabel(perspective: 'quarters' | 'horizons'): string {
  return perspective === 'quarters' ? 'Quarter by Quarter' : 'Agile Horizons';
}

export function RoadmapCanvas({
  companyId,
  roadmap,
  departmentMap,
}: {
  companyId: string;
  roadmap: RoadmapFile;
  departmentMap: Record<string, string>;
}) {
  const [perspective, setPerspective] = useState<'quarters' | 'horizons'>('quarters');
  const [adding, setAdding] = useState(false);

  const quarters = groupMilestonesByQuarter(roadmap.milestones);
  const horizons = groupMilestonesByHorizon(roadmap.milestones);
  const summary = computeRoadmapSummary(roadmap.phases, roadmap.milestones);

  return (
    <div className="space-y-8">
      {/* Top Deck: Macro Phases */}
      {roadmap.phases.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="font-mono text-xs uppercase tracking-widest text-os-dim">
              Strategic Capability Phases · {summary.completedPhases}/{summary.totalPhases} complete
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roadmap.phases.map((phase) => (
              <PhaseCard key={phase.id} phase={phase} />
            ))}
          </div>
        </section>
      )}

      {/* Main Track with Perspective Switcher */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-os-border pb-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-widest text-os-dim">
              {resolvePerspectiveLabel(perspective)}
            </span>
            <span className="font-mono text-[10px] text-os-muted">
              ({summary.completedMilestones}/{summary.totalMilestones} milestones · {summary.overallPercentComplete}%)
            </span>
          </div>

          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add a milestone
          </button>
          <div className="flex items-center gap-1 rounded-md border border-os-border bg-os-surface2 p-0.5">
            <button
              type="button"
              onClick={() => setPerspective('quarters')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] transition-colors ${
                perspective === 'quarters'
                  ? 'bg-os-accent text-os-ink font-bold'
                  : 'text-os-dim hover:text-os-text'
              }`}
            >
              <Calendar className="h-3 w-3" />
              <span>Quarters</span>
            </button>
            <button
              type="button"
              onClick={() => setPerspective('horizons')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] transition-colors ${
                perspective === 'horizons'
                  ? 'bg-os-accent text-os-ink font-bold'
                  : 'text-os-dim hover:text-os-text'
              }`}
            >
              <Layers className="h-3 w-3" />
              <span>Horizons</span>
            </button>
          </div>
          </div>
        </div>
        <AddMilestoneModal companyId={companyId} isOpen={adding} onClose={() => setAdding(false)} />

        {perspective === 'quarters' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quarters.length === 0 ? (
              <div className="col-span-full rounded-lg border border-dashed border-os-border/60 p-8 text-center text-sm text-os-dim space-y-3">
                <p>Nothing planned yet. Add the first thing you want to get done, and roughly when.</p>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add a milestone
                </button>
              </div>
            ) : (
              quarters.map((q) => (
                <div key={q.quarter} className="flex flex-col space-y-3">
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold">
                    <span className="text-os-text">{q.formattedQuarter}</span>
                    <span className="text-[10px] text-os-dim">
                      {q.doneCount}/{q.totalCount} done
                    </span>
                    <span className="h-px flex-1 bg-os-border" />
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {q.items.map((item) => (
                      <MilestoneCard
                        key={item.id}
                        milestone={item}
                        companyId={companyId}
                        departmentName={
                          item.departmentId
                            ? (departmentMap[item.departmentId] ?? item.departmentId)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {horizons.map((h) => (
              <div key={h.horizon} className="flex flex-col space-y-3">
                <div className="flex items-center gap-2 font-mono text-xs font-semibold">
                  <span className="text-os-text">{h.label}</span>
                  <span className="text-[10px] text-os-dim">({h.count})</span>
                  <span className="h-px flex-1 bg-os-border" />
                </div>

                <div className="flex flex-col gap-2.5">
                  {h.items.map((item) => (
                    <MilestoneCard
                      key={item.id}
                      milestone={item}
                      companyId={companyId}
                      departmentName={
                        item.departmentId
                          ? (departmentMap[item.departmentId] ?? item.departmentId)
                          : undefined
                      }
                    />
                  ))}
                  {h.items.length === 0 && (
                    <div className="rounded-lg border border-dashed border-os-border/60 p-4 text-center font-mono text-xs text-os-dim">
                      No milestones in this horizon.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
