import _React from 'react';
import { describe, it, expect, vi } from 'vitest';
import type { Activity } from '@/lib/adapters/types';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    default: (actual as { default?: unknown }).default || actual,
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()],
  };
});

import { ActivityBoard } from './activity-board';

describe('ActivityBoard Component', () => {
  const sampleActivities: Activity[] = [
    {
      id: 'act-1',
      title: 'feat: add git-backed activity stream',
      timestamp: 1726000000,
      agentId: 'alacran-app',
      detailPath: 'state/runs/act-1.log',
      type: 'commit',
      status: 'done',
    },
    {
      id: 'act-2',
      title: 'fix: resolve theme contrast tokens',
      timestamp: 1726003600,
      agentId: 'alacran-app',
      detailPath: 'state/runs/act-2.log',
      type: 'commit',
      status: 'done',
    },
  ];

  const agentNames = {
    'alacran-app': 'Alacrán',
  };

  it('renders ActivityBoard with FounderOS theme tokens on the sidebar', () => {
    const element = ActivityBoard({
      activities: sampleActivities,
      agentNames,
    });

    expect(element).toBeDefined();

    // The root layout has aside (sidebar) and section (detail)
    const aside = element.props.children[0];
    expect(aside.type).toBe('aside');

    // Sidebar must use FounderOS theme classes
    expect(aside.props.className).toContain('bg-os-surface');
    expect(aside.props.className).toContain('border-os-border');
    expect(aside.props.className).not.toContain('workspace-explorer');

    // Section on right must use FounderOS theme classes
    const section = element.props.children[1];
    expect(section.type).toBe('section');
    expect(section.props.className).toContain('bg-os-surface');
    expect(section.props.className).toContain('border-os-border');
  });

  it('renders sticky day group header conforming to theme tokens', () => {
    const element = ActivityBoard({
      activities: sampleActivities,
      agentNames,
    });

    const aside = element.props.children[0];
    const scrollContainer = aside.props.children[1];
    const dayGroupList = scrollContainer.props.children[1]; // array of day groups

    expect(dayGroupList).toBeDefined();
    expect(dayGroupList.length).toBeGreaterThan(0);

    const firstGroup = dayGroupList[0];
    const stickyHeader = firstGroup.props.children[0];
    expect(stickyHeader.props.className).toContain('bg-os-surface2');
    expect(stickyHeader.props.className).toContain('border-os-border');
    expect(stickyHeader.props.className).not.toContain('bg-[var(--surface-explorer)]');
  });
});
