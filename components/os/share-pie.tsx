import React from 'react';
import { pieSlices, arcPath, type PieItem } from '@/lib/os/charts/pie-math';

const SLICE_COLORS = [
  'var(--funnel-s0, var(--os-accent, #3df08c))',
  'var(--funnel-s1, #38bdf8)',
  'var(--funnel-s2, #a78bfa)',
  'var(--funnel-s3, #f59e0b)',
  'var(--funnel-s5, #f43f5e)',
  'var(--funnel-s6, #10b981)',
];

export type SharePieProps = {
  items: PieItem[];
  total: number;
  centerLabel: string;
  format: (value: number) => string;
  framed?: boolean;
  /** Donut above legend (narrow columns) instead of side by side. */
  stacked?: boolean;
  /** Rendered donut diameter in pixels. */
  donutPx?: number;
  ariaLabel: string;
};

/**
 * Generic share donut: one slice per item, a headline figure at center, and
 * a legend with values + percentages.
 */
export function SharePie({
  items,
  total,
  centerLabel,
  format,
  framed = true,
  stacked = false,
  donutPx = 140,
  ariaLabel,
}: SharePieProps) {
  const slices = pieSlices(items);
  if (slices.length === 0) {
    const emptyNotice = (
      <p className="py-4 text-center font-mono text-[10.5px] text-os-dim">Nothing to chart yet.</p>
    );
    if (framed) {
      return (
        <div className="flex h-full items-center justify-center rounded-lg border border-os-border bg-os-surface px-4 py-3">
          {emptyNotice}
        </div>
      );
    }
    return emptyNotice;
  }

  const S = 168;
  const C = S / 2;
  const R = 62;

  return (
    <div
      className={`flex ${stacked ? 'flex-col items-center gap-3' : 'items-center gap-4'} ${
        framed ? 'h-full rounded-lg border border-os-border bg-os-surface px-4 py-3' : ''
      }`}
    >
      <svg
        viewBox={`0 0 ${S} ${S}`}
        className="shrink-0"
        style={{ width: donutPx, height: donutPx }}
        role="img"
        aria-label={ariaLabel}
      >
        {slices.map((s, i) => {
          const span = s.endAngle - s.startAngle;
          const gap = span > 1.2 ? 0.6 : 0;
          return (
            <path
              key={s.key}
              d={arcPath(C, C, R, s.startAngle + gap, s.endAngle - gap)}
              fill="none"
              stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
              strokeWidth={17}
            >
              <title>{`${s.label} · ${format(s.value)} · ${(s.share * 100).toFixed(1)}%`}</title>
            </path>
          );
        })}
        <text
          x={C}
          y={C - 3}
          textAnchor="middle"
          className="fill-os-text font-mono text-[15px] font-bold"
        >
          {format(total)}
        </text>
        <text
          x={C}
          y={C + 13}
          textAnchor="middle"
          className="fill-os-dim font-mono text-[7.5px] uppercase tracking-[0.18em]"
        >
          {centerLabel}
        </text>
      </svg>

      <div className={`flex flex-col gap-1 ${stacked ? 'w-full' : 'min-w-0 flex-1'}`}>
        {slices.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 font-mono text-[10px]">
            <span
              className="h-2 w-2 shrink-0 rounded-xs"
              style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate uppercase tracking-[0.08em] text-os-dim">{s.label}</span>
            <span className="shrink-0 text-os-muted">{format(s.value)}</span>
            <span className="w-11 shrink-0 text-right text-os-text">{`${(s.share * 100).toFixed(1)}%`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
