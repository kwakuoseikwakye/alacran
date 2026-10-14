import React from 'react';
import type { DoctorReport } from '@/lib/os/doctor/types';

export function calculateStrokeDashoffset(score: number, circumference: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return circumference - (clamped / 100) * circumference;
}

const GRADE_COLORS: Record<string, { stroke: string; text: string; bg: string }> = {
  Optimal: { stroke: 'stroke-os-ok', text: 'text-os-ok', bg: 'bg-os-ok/10' },
  Operational: { stroke: 'stroke-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  Degraded: { stroke: 'stroke-os-warn', text: 'text-os-warn', bg: 'bg-os-warn/10' },
  Critical: { stroke: 'stroke-os-err', text: 'text-os-err', bg: 'bg-os-err/10' },
};

export function HealthMeter({ report }: { report: DoctorReport }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = calculateStrokeDashoffset(report.overallScore, circumference);
  const color = GRADE_COLORS[report.grade] ?? GRADE_COLORS.Optimal;

  return (
    <div className="flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-os-dim">
          Composite Health Score
        </span>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${color.bg} ${color.text}`}>
          {report.grade}
        </span>
      </div>

      <div className="my-6 flex items-center justify-center gap-6">
        <div
          className="relative h-28 w-28"
          role="progressbar"
          aria-valuenow={report.overallScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Composite Health Score"
        >
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="stroke-os-border"
              strokeWidth="8"
              fill="transparent"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              className={`transition-all duration-700 ease-out ${color.stroke}`}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-mono text-2xl font-bold text-os-text">{report.overallScore}</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-os-dim">/ 100</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2.5">
          <div>
            <div className="flex justify-between font-mono text-[10.5px] text-os-muted">
              <span>Repository Invariants</span>
              <span className="text-os-text">{report.categories.repository.score}/{report.categories.repository.max}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-os-border">
              <div
                className="h-full bg-os-accent transition-all duration-500"
                style={{ width: `${(report.categories.repository.score / (report.categories.repository.max || 1)) * 100}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between font-mono text-[10.5px] text-os-muted">
              <span>Connectors & Tools</span>
              <span className="text-os-text">{report.categories.connectors.score}/{report.categories.connectors.max}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-os-border">
              <div
                className="h-full bg-cyan-400 transition-all duration-500"
                style={{ width: `${(report.categories.connectors.score / (report.categories.connectors.max || 1)) * 100}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between font-mono text-[10.5px] text-os-muted">
              <span>Operational Records</span>
              <span className="text-os-text">{report.categories.records.score}/{report.categories.records.max}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-os-border">
              <div
                className="h-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${(report.categories.records.score / (report.categories.records.max || 1)) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-os-border pt-3 font-mono text-[10px] text-os-dim">
        Evaluated across {report.checks.length} real-time system invariants.
      </div>
    </div>
  );
}
