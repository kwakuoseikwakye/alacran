import React from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import type { PendingMetric } from '@/lib/os/analytics/types';

export function PendingSourcesCard({ pending }: { pending: PendingMetric[] }): React.ReactElement {
  return (
    <div className="flex h-full flex-col justify-between rounded-lg border border-os-border bg-os-surface p-5">
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-os-dim">
            Data Readiness & Inactive Records
          </span>
          <span className="font-mono text-[10px] text-os-dim">
            {pending.length === 0 ? 'Optimal' : `${pending.length} pending`}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-7 w-7 text-os-ok" />
            <p className="mt-2 font-mono text-xs text-os-text font-medium">All department records live</p>
            <p className="mt-0.5 text-[11px] text-os-dim">
              Operational files connected across finances, funnel, social, content, and workflows.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded border border-os-border/70 bg-os-surface2/60 p-2.5"
              >
                <div>
                  <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-os-text">
                    <span className="h-1.5 w-1.5 rounded-full bg-os-warn" aria-hidden="true" />
                    <span>{p.label}</span>
                    <span className="rounded bg-os-border/50 px-1 py-0.5 font-mono text-[9px] uppercase text-os-dim">
                      {p.department}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-os-dim">{p.reason}</p>
                </div>

                <Link
                  href={p.actionHref}
                  className="flex shrink-0 items-center gap-1 rounded border border-os-border bg-os-surface px-2 py-1 font-mono text-[10px] text-os-dim transition-colors hover:border-os-accent hover:text-os-text"
                >
                  <span>{p.actionLabel}</span>
                  <ArrowRight className="h-2.5 w-2.5" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
