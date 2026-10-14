import React from 'react';
import Link from 'next/link';
import type { RoadmapMilestone, RoadmapStatus } from '@/lib/os/schemas/roadmap';
import { ShieldAlert, Calendar } from 'lucide-react';

export function resolveMilestoneStatusBadge(status: RoadmapStatus): {
  tone: 'ok' | 'accent' | 'warn' | 'default';
  label: string;
} {
  switch (status) {
    case 'done':
      return { tone: 'ok', label: 'Done' };
    case 'now':
      return { tone: 'accent', label: 'Now' };
    case 'next':
      return { tone: 'warn', label: 'Next' };
    default:
      return { tone: 'default', label: 'Later' };
  }
}

const BADGE_STYLES = {
  ok: 'bg-os-ok/10 text-os-ok border-os-ok/20',
  accent: 'bg-os-accent/10 text-os-accent border-os-accent/20',
  warn: 'bg-os-warn/10 text-os-warn border-os-warn/20',
  default: 'bg-os-surface2 text-os-dim border-os-border',
};

export function MilestoneCard({
  milestone,
  companyId,
  departmentName,
}: {
  milestone: RoadmapMilestone;
  companyId: string;
  departmentName?: string;
}) {
  const isDone = milestone.status === 'done';
  const badge = resolveMilestoneStatusBadge(milestone.status);

  return (
    <div
      className={`group flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-3.5 transition-all hover:border-os-accent/50 ${
        isDone ? 'opacity-65' : ''
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h4
            className={`text-xs font-bold leading-snug text-os-text ${
              isDone ? 'line-through text-os-dim' : ''
            }`}
          >
            {milestone.title}
          </h4>
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
              BADGE_STYLES[badge.tone]
            }`}
          >
            {badge.label}
          </span>
        </div>

        <p className="mt-1.5 text-[11px] leading-relaxed text-os-muted">
          {milestone.description}
        </p>

        {milestone.deliverable && (
          <div className="mt-2 rounded bg-os-surface2 px-2 py-1 font-mono text-[10px] text-os-dim border border-os-border/50">
            <span className="text-os-muted font-medium">Deliverable:</span> {milestone.deliverable}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-os-border/50 pt-2 font-mono text-[10px]">
        {departmentName && (
          <div className="flex items-center gap-1.5 text-os-dim">
            <span className="h-1.5 w-1.5 rounded-sm bg-os-accent" />
            <span>{departmentName}</span>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {milestone.targetDate && (
            <div className="flex items-center gap-1 text-os-dim">
              <Calendar className="h-3 w-3 text-os-dim" />
              <span>{milestone.targetDate}</span>
            </div>
          )}

          {milestone.gateCheckpoint && (
            <Link
              href={`/c/${companyId}/tasks`}
              className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9.5px] font-bold text-os-warn border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              title={`Requires Human Gate signoff: ${milestone.gateCheckpoint}`}
            >
              <ShieldAlert className="h-3 w-3" />
              <span>Gate: {milestone.gateCheckpoint}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
