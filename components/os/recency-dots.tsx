import React from 'react';

/**
 * Recency grade for an item/post: one dot per item in the set, lit count =
 * how recent (all lit = newest, one lit = oldest, zero lit = quiet).
 */
export function RecencyDots({ rank, of }: { rank: number; of: number }) {
  const count = Math.max(0, of);
  const lit = Math.max(0, Math.min(count, count - rank));

  return (
    <div className="mt-1.5 flex items-center gap-1" title={`#${rank + 1} most recent of ${of}`}>
      {Array.from({ length: count }, (_, d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background:
              d < lit
                ? 'var(--os-accent, #3df08c)'
                : 'var(--os-surface2, rgba(255,255,255,0.06))',
            opacity: d < lit ? 0.45 + 0.55 * (count > 0 ? lit / count : 1) : 1,
          }}
        />
      ))}
    </div>
  );
}
