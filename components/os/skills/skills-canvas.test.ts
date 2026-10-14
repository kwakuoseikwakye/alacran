import { tree, kids } from "@/lib/test/element-tree";
import { describe, it, expect } from 'vitest';
import { SkillsCanvas } from './skills-canvas';
import type { CatalogSkill } from '@/lib/os/skills/types';

describe('SkillsCanvas', () => {
  const mockSkills: CatalogSkill[] = [
    {
      id: 'deploy',
      name: 'deploy',
      description: 'Deploy the application to production',
      category: 'Engineering',
      provenance: 'company',
      provenanceLabel: 'Acme Corp',
      filePath: '/test/.claude/skills/deploy/SKILL.md',
      isEditable: true,
      status: 'live',
    },
    {
      id: 'outreach',
      name: 'outreach',
      description: 'Cold outreach email templates',
      category: 'Sales',
      provenance: 'global',
      provenanceLabel: 'Global (~/.claude)',
      filePath: '~/.claude/skills/outreach/SKILL.md',
      isEditable: false,
      status: 'live',
    },
    {
      id: 'verify',
      name: 'verify',
      description: 'Run health check on repository',
      category: 'Commands',
      provenance: 'command',
      provenanceLabel: 'Acme Corp · Command',
      filePath: '/test/.claude/commands/verify.md',
      isEditable: true,
      status: 'live',
    },
  ];

  it('exports SkillsCanvas component function', () => {
    expect(typeof SkillsCanvas).toBe('function');
  });

  it('renders search bar, category tabs, and skill cards', () => {
    const element = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
    }));

    expect(element).toBeDefined();
    expect(element.props.className).toContain('space-y-6');

    // Children: control bar [0], grid sections [1], optional modal [2]
    const children = kids(element);
    const controlBar = children[0];
    expect(controlBar).toBeDefined();

    // Verify search input container
    const searchContainer = controlBar.props.children[0];
    const searchInput = searchContainer.props.children[1];
    expect(searchInput.type).toBe('input');
    expect(searchInput.props.placeholder).toBe('Search skills by name, keyword, or command...');
    expect(searchInput.props['aria-label']).toBe('Search skills');

    // Verify category tabs container
    const categoryTabsContainer = controlBar.props.children[1];
    const categoryButtons = kids(categoryTabsContainer);
    // All tab + Engineering, Sales, Commands = 4 tabs
    expect(categoryButtons).toHaveLength(4);
  });

  it('filters skills by category when initialCategory is specified', () => {
    const element = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
      initialCategory: 'engineering',
    }));

    expect(element).toBeDefined();
    const children = kids(element);
    const sectionsContainer = children[1];
    expect(sectionsContainer.props.className).toContain('space-y-8');

    // Only Engineering section should be rendered
    const sections = kids(sectionsContainer);
    expect(sections).toHaveLength(1);
    expect(sections[0].props['aria-label']).toBe('Engineering Skills');
  });

  it('normalizes initialCategory case-insensitively', () => {
    const element = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
      initialCategory: 'Engineering',
    }));

    expect(element).toBeDefined();
    const children = kids(element);
    const sectionsContainer = children[1];
    const sections = kids(sectionsContainer);
    expect(sections).toHaveLength(1);
    expect(sections[0].props['aria-label']).toBe('Engineering Skills');
  });

  it('filters skills by search query across name and description', () => {
    // Search by name
    const elementByName = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
      initialSearchQuery: 'outreach',
    }));

    const childrenName = kids(elementByName);
    const sectionsContainerName = childrenName[1];
    const sectionsName = kids(sectionsContainerName);
    expect(sectionsName).toHaveLength(1);
    expect(sectionsName[0].props['aria-label']).toBe('Sales Skills');

    // Search by description keyword
    const elementByDesc = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
      initialSearchQuery: 'health check',
    }));

    const childrenDesc = kids(elementByDesc);
    const sectionsContainerDesc = childrenDesc[1];
    const sectionsDesc = kids(sectionsContainerDesc);
    expect(sectionsDesc).toHaveLength(1);
    expect(sectionsDesc[0].props['aria-label']).toBe('Commands Skills');
  });

  it('filters skills by search query matching id or provenanceLabel', () => {
    const elementByProv = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
      initialSearchQuery: 'Global',
    }));

    const children = kids(elementByProv);
    const sectionsContainer = children[1];
    const sections = kids(sectionsContainer);
    expect(sections).toHaveLength(1);
    expect(sections[0].props['aria-label']).toBe('Sales Skills');
  });

  it('renders empty state when no skills match search query or category', () => {
    const element = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
      initialSearchQuery: 'nonexistent-xyz-query',
    }));

    const children = kids(element);
    const emptyContainer = children[1];
    expect(emptyContainer.props.className).toContain('border-dashed');
    const textP = emptyContainer.props.children[1];
    expect(textP.props.children).toBe('No skills found');
  });

  it('renders clear button when search query is non-empty', () => {
    const element = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
      initialSearchQuery: 'search-term',
    }));

    const children = kids(element);
    const controlBar = children[0];
    const searchContainer = controlBar.props.children[0];
    const clearButton = searchContainer.props.children[2];
    expect(clearButton).toBeDefined();
    expect(clearButton.props.type).toBe('button');
    expect(clearButton.props['aria-label']).toBe('Clear search');
  });

  it('renders detail and edit modal when viewingSkill is set', () => {
    const element = tree(SkillsCanvas({
      skills: mockSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
      initialViewingSkill: mockSkills[0],
    }));

    const children = kids(element);
    const modal = children[2];
    expect(modal).toBeDefined();
    expect(modal.props.skill).toEqual(mockSkills[0]);
    expect(modal.props.companyId).toBe('test-co');
  });

  it('handles empty skills array gracefully', () => {
    const element = tree(SkillsCanvas({
      skills: [],
      companyId: 'test-co',
      companyName: 'Test Co',
    }));

    expect(element).toBeDefined();
    const children = kids(element);
    const emptyContainer = children[1];
    expect(emptyContainer.props.className).toContain('border-dashed');
  });

  it('orders category sections according to CATEGORY_ORDER', () => {
    const disorderedSkills: CatalogSkill[] = [
      {
        id: 'cmd',
        name: 'cmd',
        description: 'Command skill',
        category: 'Commands',
        provenance: 'command',
        provenanceLabel: 'Cmd',
        filePath: '/cmd.md',
        isEditable: true,
      },
      {
        id: 'eng',
        name: 'eng',
        description: 'Engineering skill',
        category: 'Engineering',
        provenance: 'company',
        provenanceLabel: 'Eng',
        filePath: '/eng/SKILL.md',
        isEditable: true,
      },
      {
        id: 'ops',
        name: 'ops',
        description: 'Ops skill',
        category: 'Operations',
        provenance: 'company',
        provenanceLabel: 'Ops',
        filePath: '/ops/SKILL.md',
        isEditable: true,
      },
    ];

    const element = tree(SkillsCanvas({
      skills: disorderedSkills,
      companyId: 'test-co',
      companyName: 'Test Co',
    }));

    const children = kids(element);
    const sectionsContainer = children[1];
    const sections = kids(sectionsContainer);
    
    // CATEGORY_ORDER: Engineering (0), Operations (1), Commands (4)
    expect(sections[0].props['aria-label']).toBe('Engineering Skills');
    expect(sections[1].props['aria-label']).toBe('Operations Skills');
    expect(sections[2].props['aria-label']).toBe('Commands Skills');
  });
});
