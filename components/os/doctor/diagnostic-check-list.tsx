'use client';

import React, { useState } from 'react';
import type { CheckStatus, DiagnosticCheckResult } from '@/lib/os/doctor/types';
import { Terminal, Copy, Check, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';

export function filterChecks(
  checks: DiagnosticCheckResult[],
  filter: 'all' | 'issues' | 'passing',
): DiagnosticCheckResult[] {
  if (filter === 'issues') return checks.filter((c) => c.status !== 'pass');
  if (filter === 'passing') return checks.filter((c) => c.status === 'pass');
  return checks;
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'pass') return <CheckCircle2 className="h-4 w-4 text-os-ok" />;
  if (status === 'warn') return <AlertTriangle className="h-4 w-4 text-os-warn" />;
  return <XCircle className="h-4 w-4 text-os-err" />;
}

export function DiagnosticCheckList({ checks }: { checks: DiagnosticCheckResult[] }) {
  const [filter, setFilter] = useState<'all' | 'issues' | 'passing'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const displayedChecks = filterChecks(checks, filter);
  const issuesCount = checks.filter((c) => c.status !== 'pass').length;
  const passingCount = checks.filter((c) => c.status === 'pass').length;

  const handleCopy = (id: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedId(id);
          setTimeout(() => setCopiedId(null), 1800);
        })
        .catch(() => {});
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-os-border bg-os-surface">
      <div className="flex flex-wrap items-center justify-between border-b border-os-border p-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-os-dim" />
          <span className="font-mono text-xs font-bold text-os-text">Diagnostic Verification Matrix</span>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-os-border bg-os-surface2 p-0.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded px-2.5 py-1 font-mono text-[10px] transition-colors ${
              filter === 'all'
                ? 'bg-os-accent text-os-ink font-bold'
                : 'text-os-dim hover:text-os-text'
            }`}
          >
            All ({checks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('issues')}
            className={`rounded px-2.5 py-1 font-mono text-[10px] transition-colors ${
              filter === 'issues'
                ? 'bg-os-accent text-os-ink font-bold'
                : 'text-os-dim hover:text-os-text'
            }`}
          >
            Issues ({issuesCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('passing')}
            className={`rounded px-2.5 py-1 font-mono text-[10px] transition-colors ${
              filter === 'passing'
                ? 'bg-os-accent text-os-ink font-bold'
                : 'text-os-dim hover:text-os-text'
            }`}
          >
            Passing ({passingCount})
          </button>
        </div>
      </div>

      <div className="divide-y divide-os-border">
        {displayedChecks.map((check) => {
          const cmdText = check.remediation?.command || check.remediation?.slashCommand;

          return (
            <div key={check.id} className="flex flex-col gap-2 p-3 sm:p-4 hover:bg-os-surface2/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    <StatusIcon status={check.status} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-os-text">{check.title}</span>
                      <span className="rounded bg-os-surface2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-os-dim border border-os-border">
                        {check.category}
                      </span>
                    </div>
                    <div className="mt-1 text-[11.5px] text-os-muted">{check.message}</div>
                  </div>
                </div>

                <div className="shrink-0 font-mono text-xs font-semibold">
                  <span className={check.status === 'pass' ? 'text-os-ok' : check.status === 'warn' ? 'text-os-warn' : 'text-os-err'}>
                    {check.earnedPoints}
                  </span>
                  <span className="text-os-dim"> / {check.weight} pts</span>
                </div>
              </div>

              {check.remediation && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-os-border bg-os-bg p-2 font-mono text-xs">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="rounded bg-os-surface px-1.5 py-0.5 text-[9.5px] uppercase font-bold text-os-accent">
                      {check.remediation.actionLabel}
                    </span>
                    <code className="truncate text-os-text">
                      {cmdText}
                    </code>
                  </div>

                  {cmdText && (
                    <button
                      type="button"
                      onClick={() => handleCopy(check.id, cmdText)}
                      className="flex shrink-0 items-center gap-1 rounded border border-os-border bg-os-surface px-2 py-1 text-[10px] text-os-muted hover:text-os-text hover:bg-os-surface2 transition-colors"
                    >
                      {copiedId === check.id ? (
                        <>
                          <Check className="h-3 w-3 text-os-ok" />
                          <span className="text-os-ok font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
