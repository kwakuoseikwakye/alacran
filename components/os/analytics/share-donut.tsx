import React from 'react';
import type { DistributionChartData } from '@/lib/os/analytics/types';

export function ShareDonutCard({ data }: { data: DistributionChartData }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius; // ~339.292
  let accumulatedOffset = 0;

  return (
    <div className="flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-5">
      <div>
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-os-dim">
            {data.title}
          </span>
          <span className="font-mono text-[10px] text-os-dim">{data.subtitle}</span>
        </div>

        {/* SVG Radial Donut */}
        <div className="relative mx-auto my-3 flex h-[160px] w-[160px] items-center justify-center">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90 transform" aria-hidden="true">
            {/* Background ring */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="var(--os-border, rgba(255,255,255,0.08))"
              strokeWidth="14"
            />
            {data.slices.map((slice) => {
              const dash = (slice.percentage / 100) * circumference;
              const currentOffset = accumulatedOffset;
              accumulatedOffset += dash;

              return (
                <circle
                  key={slice.key}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="14"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="butt"
                />
              );
            })}
          </svg>

          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-mono text-base font-bold text-os-text">
              {data.formattedTotal}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-os-dim">
              {data.centerLabel}
            </span>
          </div>
        </div>

        {/* Legend Slices */}
        <div className="mt-5 space-y-2 border-t border-os-border/40 pt-3">
          {data.slices.map((slice) => (
            <div key={slice.key} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
                <span className="text-os-text font-medium">{slice.label}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="text-os-dim">{slice.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
