import { describe, it, expect } from 'vitest';
import { tree } from "@/lib/test/element-tree";
import { SkillCard, getSkillIcon } from './skill-card';
import type { CatalogSkill } from '@/lib/os/skills/types';

describe('SkillCard', () => {
  it('exports SkillCard component function and getSkillIcon helper', () => {
    expect(typeof SkillCard).toBe('function');
    expect(typeof getSkillIcon).toBe('function');
  });

  it('maps categories to appropriate icons', () => {
    expect(getSkillIcon('Firecrawl', 'crawl')).toBeDefined();
    expect(getSkillIcon('Commands', 'verify')).toBeDefined();
    expect(getSkillIcon('Engineering', 'deploy')).toBeDefined();
    expect(getSkillIcon('Sales', 'pitch')).toBeDefined();
    expect(getSkillIcon('Content', 'draft')).toBeDefined();
    expect(getSkillIcon('Operations', 'sync')).toBeDefined();
    expect(getSkillIcon('UnknownCategory', 'custom')).toBeDefined();
  });

  it('renders skill details with provenance and status', () => {
    const mockSkill: CatalogSkill = {
      id: 'deploy',
      name: 'deploy-service',
      description: 'Deploys the service to staging',
      category: 'Engineering',
      provenance: 'company',
      provenanceLabel: 'Acme Corp',
      filePath: '/path/to/deploy/SKILL.md',
      isEditable: true,
      status: 'live',
    };

    let selected: CatalogSkill | null = null;
    const element = tree(SkillCard({ skill: mockSkill, onSelect: (s) => { selected = s; } }));
    expect(element).toBeDefined();
    expect(element.props['title']).toBe('deploy-service — open details');
    expect(element.props['type']).toBe('button');

    // Verify click triggers onSelect
    element.props.onClick();
    expect(selected).toEqual(mockSkill);
  });

  it('handles skill without status and non-editable', () => {
    const mockSkill: CatalogSkill = {
      id: 'read-only-skill',
      name: 'read-only-skill',
      description: 'A read only global skill',
      category: 'Operations',
      provenance: 'global',
      provenanceLabel: 'Global System',
      filePath: '/global/skills/SKILL.md',
      isEditable: false,
    };

    const element = tree(SkillCard({ skill: mockSkill, onSelect: () => {} }));
    expect(element).toBeDefined();
    expect(element.props['title']).toBe('read-only-skill — open details');
  });
});
