import React, { useId } from 'react';
import type { DailyVolumePoint } from '@/lib/os/analytics/types';

export function ActivityVolumeChart({
  data,
  total14d,
}: {
  data: DailyVolumePoint[];
  total14d: number;
}) {
  const gradientId = useId();
  const W = 640;
  const H = 170;
  const pad = 10;
  const max = Math.max(...data.map((d) => d.count), 1);
  const n = data.length;

  const xAt = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const yAt = (v: number) => H - pad - (v / max) * (H - pad * 2);

  const pts = data.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.count).toFixed(1)}`);
  const polygonPoints = `0,${H} ${pts.join(' ')} ${W},${H}`;
  const polylinePoints = pts.join(' ');

  const formatShortDate = (iso: string) => {
    const parts = iso.split('-');
    if (parts.length < 3) return iso;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const m = months[parseInt(parts[1], 10) - 1] ?? parts[1];
    return `${m} ${parseInt(parts[2], 10)}`;
  };

  return (
    <div className="flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-5">
      <div>
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-os-dim">
            Operating Execution Volume · 14d
          </span>
          <span className="font-mono text-[11px] text-os-muted">{total14d} total actions</span>
        </div>

        <div className="mt-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[170px] w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-os-accent, var(--accent, #3df08c))" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--color-os-accent, var(--accent, #3df08c))" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="var(--os-border, rgba(255,255,255,0.08))" strokeWidth="1" />
            ))}
            <polygon points={polygonPoints} fill={`url(#${gradientId})`} />
            <polyline
              points={polylinePoints}
              fill="none"
              stroke="var(--color-os-accent, var(--accent, #3df08c))"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {data.length > 0 && (
          <div className="mt-3 flex justify-between font-mono text-[9.5px] uppercase tracking-wider text-os-dim">
            {data.length === 1 ? (
              <span className="mx-auto">{formatShortDate(data[0].date)}</span>
            ) : data.length === 2 ? (
              <>
                <span>{formatShortDate(data[0].date)}</span>
                <span>{formatShortDate(data[1].date)}</span>
              </>
            ) : (
              <>
                <span>{formatShortDate(data[0].date)}</span>
                <span>{formatShortDate(data[Math.floor(data.length / 2)].date)}</span>
                <span>{formatShortDate(data[data.length - 1].date)}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
