import React from 'react';
import type { RoadmapPhase } from '@/lib/os/schemas/roadmap';

export function formatPhaseNumber(num: number): string {
  return `PHASE ${String(num).padStart(2, '0')}`;
}

const PHASE_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  done: { bg: 'bg-os-ok/10', text: 'text-os-ok', label: 'Done' },
  now: { bg: 'bg-os-accent/10', text: 'text-os-accent', label: 'Now' },
  next: { bg: 'bg-os-warn/10', text: 'text-os-warn', label: 'Next' },
  later: { bg: 'bg-os-border', text: 'text-os-dim', label: 'Later' },
};

export function PhaseCard({ phase }: { phase: RoadmapPhase }) {
  const statusInfo = PHASE_STATUS_STYLES[phase.status] ?? PHASE_STATUS_STYLES.later;

  return (
    <div className="flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[0.18em] text-os-accent font-bold">
            {formatPhaseNumber(phase.number)}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase font-semibold ${statusInfo.bg} ${statusInfo.text}`}>
            {statusInfo.label}
          </span>
        </div>
        <h3 className="text-sm font-bold text-os-text">{phase.title}</h3>
        <ul className="mt-3 space-y-1.5">
          {phase.items.map((item, idx) => (
            <li key={`${phase.id}-item-${idx}`} className="flex items-start gap-2 text-xs text-os-muted">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-os-accent/70" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
