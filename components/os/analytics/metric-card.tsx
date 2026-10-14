import React from 'react';
import Link from 'next/link';
import type { MetricTile } from '@/lib/os/analytics/types';

export function formatSparklinePoints(data: number[], width = 96, height = 26): string {
  if (!data || data.length === 0) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 3;
  const innerH = height - pad * 2;

  return data
    .map((val, idx) => {
      const x = (idx / (data.length - 1 || 1)) * width;
      const y = height - pad - ((val - min) / range) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function MetricCard({ tile }: { tile: MetricTile }): React.ReactElement {
  const points = formatSparklinePoints(tile.sparkline, 96, 26);
  const hasDelta = typeof tile.delta === 'number' && (tile.delta !== 0 || tile.deltaTone !== undefined);
  const isUp = typeof tile.delta === 'number' && tile.delta > 0;
  const isDown = typeof tile.delta === 'number' && tile.delta < 0;
  const tone =
    tile.deltaTone ??
    (typeof tile.delta === 'number' && tile.delta > 0
      ? 'ok'
      : typeof tile.delta === 'number' && tile.delta < 0
        ? 'err'
        : 'neutral');
  const toneClass =
    tone === 'ok'
      ? 'text-os-ok'
      : tone === 'warn'
        ? 'text-os-warn'
        : tone === 'err'
          ? 'text-os-err'
          : 'text-os-dim';

  const cardContent = (
    <div
      className={`group flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-4 transition-all${
        tile.href ? ' hover:border-os-accent/40' : ''
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
            {tile.label}
          </span>
          {hasDelta ? (
            <span className={`font-mono text-[10px] font-bold ${toneClass}`}>
              {isUp ? '▲ +' : isDown ? '▼ ' : ''}
              {Math.abs(tile.delta!)}
              {tile.deltaPct ? '%' : ''}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-os-dim">—</span>
          )}
        </div>

        <div className="mt-2 flex items-baseline gap-1.5 font-mono text-2xl font-bold tracking-tight text-os-text">
          {tile.formattedValue}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2 border-t border-os-border/40 pt-2.5">
        <svg
          viewBox="0 0 96 26"
          className="h-[22px] w-[84px] shrink-0 text-os-accent"
          aria-hidden="true"
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span className="font-mono text-[9px] uppercase tracking-widest text-os-dim">
          {tile.source}
        </span>
      </div>
    </div>
  );

  if (tile.href) {
    return <Link href={tile.href}>{cardContent}</Link>;
  }

  return cardContent;
}
