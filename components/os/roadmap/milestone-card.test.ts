import { describe, it, expect } from 'vitest';
import { resolveMilestoneStatusBadge, MilestoneCard } from './milestone-card';

describe('Milestone Card Status Badges', () => {
  it('maps roadmap status to correct tones and labels', () => {
    expect(resolveMilestoneStatusBadge('done')).toEqual({ tone: 'ok', label: 'Done' });
    expect(resolveMilestoneStatusBadge('now')).toEqual({ tone: 'accent', label: 'Now' });
    expect(resolveMilestoneStatusBadge('next')).toEqual({ tone: 'warn', label: 'Next' });
    expect(resolveMilestoneStatusBadge('later')).toEqual({ tone: 'default', label: 'Later' });
  });

  it('exports MilestoneCard component', () => {
    expect(typeof MilestoneCard).toBe('function');
  });
});
