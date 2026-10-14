import React from 'react';
import {
  Code2,
  Target,
  Clapperboard,
  Cog,
  Terminal,
  Flame,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { CatalogSkill } from '@/lib/os/skills/types';

const STATUS_COLOR: Record<string, string> = {
  live: 'var(--color-os-ok, #3df08c)',
  learning: 'var(--color-os-warn, #f59e0b)',
  planned: 'var(--color-os-dim, #71717a)',
};

export function getSkillIcon(category: string, _id?: string): LucideIcon {
  if (category === 'Firecrawl') return Flame;
  if (category === 'Commands') return Terminal;
  if (category === 'Engineering') return Code2;
  if (category === 'Sales') return Target;
  if (category === 'Content') return Clapperboard;
  if (category === 'Operations') return Cog;
  return Sparkles;
}

export function SkillCard({
  skill,
  onSelect,
}: {
  skill: CatalogSkill;
  onSelect: (skill: CatalogSkill) => void;
}): React.ReactElement {
  const Icon = getSkillIcon(skill.category, skill.id);

  return (
    <button
      type="button"
      onClick={() => onSelect(skill)}
      title={`${skill.name} — open details`}
      className="group flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-3.5 text-left transition-all hover:border-os-border-strong hover:bg-os-surface2"
    >
      <div>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-os-accent" strokeWidth={1.8} />
          <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-os-text group-hover:text-os-accent transition-colors">
            {skill.name}
          </span>
          {skill.status && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: STATUS_COLOR[skill.status] ?? STATUS_COLOR.live }}
              aria-hidden="true"
            />
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-os-dim">
          {skill.description}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-os-muted">
        <span className="truncate rounded bg-os-surface2 px-1.5 py-0.5 border border-os-border/50">
          {skill.provenanceLabel}
        </span>
        {skill.isEditable && (
          <span className="text-os-dim font-medium lowercase">editable</span>
        )}
      </div>
    </button>
  );
}
