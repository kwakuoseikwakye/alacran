'use client';

import React, { useState, useMemo } from 'react';
import { Search, X, Sparkles } from 'lucide-react';
import { CATEGORY_ORDER, type CatalogSkill } from '@/lib/os/skills/types';
import { SkillCard } from './skill-card';
import { SkillModal } from './skill-modal';

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial);
  } catch {
    const val = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [val, () => {}];
  }
}

function useSafeMemo<T>(factory: () => T, deps: React.DependencyList): T {
  try {
    return useMemo(factory, deps);
  } catch {
    return factory();
  }
}

export function SkillsCanvas({
  skills,
  companyId,
  companyName: _companyName,
  initialSearchQuery = '',
  initialCategory = 'all',
  initialViewingSkill = null,
}: {
  skills: CatalogSkill[];
  companyId: string;
  companyName: string;
  initialSearchQuery?: string;
  initialCategory?: string;
  initialViewingSkill?: CatalogSkill | null;
}): React.ReactElement {
  const [searchQuery, setSearchQuery] = useSafeState(initialSearchQuery);
  const [activeCategory, setActiveCategory] = useSafeState<string>((initialCategory?.toLowerCase()) || 'all');
  const [viewingSkill, setViewingSkill] = useSafeState<CatalogSkill | null>(initialViewingSkill);

  // Available categories with counts
  const categories = useSafeMemo(() => {
    const map = new Map<string, number>();
    for (const s of skills) {
      map.set(s.category, (map.get(s.category) ?? 0) + 1);
    }
    const list = Array.from(map.entries()).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a[0].localeCompare(b[0]);
    });
    return list;
  }, [skills]);

  // Filter skills by search and category
  const filteredSkills = useSafeMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return skills.filter((s) => {
      const matchesCategory = activeCategory === 'all' || s.category.toLowerCase() === activeCategory.toLowerCase();
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.provenanceLabel.toLowerCase().includes(q)
      );
    });
  }, [skills, searchQuery, activeCategory]);

  // Group filtered skills by category
  const groupedSections = useSafeMemo(() => {
    const groups = new Map<string, CatalogSkill[]>();
    for (const s of filteredSkills) {
      const list = groups.get(s.category) ?? [];
      list.push(s);
      groups.set(s.category, list);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a[0].localeCompare(b[0]);
    });
  }, [filteredSkills]);

  return (
    <div className="space-y-6">
      {/* Control Bar: Search Input & Category Pills */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-os-dim" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills by name, keyword, or command..."
            aria-label="Search skills"
            className="w-full rounded-md border border-os-border bg-os-surface py-2 pl-9 pr-8 font-mono text-xs text-os-text placeholder-os-dim outline-none transition-colors focus:border-os-accent focus:ring-1 focus:ring-os-accent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-os-dim hover:text-os-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
              activeCategory === 'all'
                ? 'bg-os-accent text-os-bg font-semibold'
                : 'border border-os-border bg-os-surface text-os-dim hover:border-os-border-strong hover:text-os-text'
            }`}
          >
            All ({skills.length})
          </button>
          {categories.map(([cat, count]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat.toLowerCase())}
              className={`rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                activeCategory === cat.toLowerCase()
                  ? 'bg-os-accent text-os-bg font-semibold'
                  : 'border border-os-border bg-os-surface text-os-dim hover:border-os-border-strong hover:text-os-text'
              }`}
            >
              {cat} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Grid Sections */}
      {groupedSections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-os-border py-16 text-center">
          <Sparkles className="h-6 w-6 text-os-dim" />
          <p className="mt-2 font-mono text-xs font-medium text-os-text">No skills found</p>
          <p className="mt-0.5 font-mono text-[11px] text-os-dim">
            Try adjusting your search query or switching category tabs.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedSections.map(([category, items]) => (
            <section key={category} aria-label={`${category} Skills`} className="space-y-3">
              <div className="flex items-center justify-between border-b border-os-border/70 pb-2">
                <span className="font-mono text-xs uppercase tracking-wider text-os-dim">
                  {category}
                </span>
                <span className="font-mono text-[11px] text-os-muted">
                  {items.length} {items.length === 1 ? 'skill' : 'skills'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((skill) => (
                  <SkillCard key={skill.id} skill={skill} onSelect={(s) => setViewingSkill(s)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Detail & Edit Modal */}
      {viewingSkill && (
        <SkillModal
          skill={viewingSkill}
          companyId={companyId}
          onClose={() => setViewingSkill(null)}
          onSaveSuccess={() => {
            // Can optionally trigger router refresh or local update
          }}
        />
      )}
    </div>
  );
}
