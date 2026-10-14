import React from 'react';

export type BadgeTone = 'accent' | 'neutral' | 'ok' | 'warn' | 'err' | 'default';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-os-surface2 text-os-dim border-os-border',
  default: 'bg-os-surface2 text-os-dim border-os-border',
  accent: 'bg-os-accent/10 text-os-accent border-os-accent/20',
  ok: 'bg-os-ok/10 text-os-ok border-os-ok/20',
  warn: 'bg-os-warn/10 text-os-warn border-os-warn/20',
  err: 'bg-os-err/10 text-os-err border-os-err/20',
};

export function Badge({
  children,
  tone = 'neutral',
  className = '',
}: BadgeProps): React.ReactElement {
  const toneClass = BADGE_TONES[tone] ?? BADGE_TONES.neutral;
  const classes = [
    'inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide uppercase',
    toneClass,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={classes}>{children}</span>;
}
