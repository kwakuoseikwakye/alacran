import { describe, it, expect } from 'vitest';
import {
  groupMilestonesByQuarter,
  groupMilestonesByHorizon,
  computeRoadmapSummary,
} from './grouping';
import type { RoadmapMilestone, RoadmapPhase } from '../schemas/roadmap';

describe('Roadmap Grouping Utilities', () => {
  const sampleMilestones: RoadmapMilestone[] = [
    { id: '1', title: 'A', description: 'Desc A', quarter: '2026-Q2', status: 'next' },
    { id: '2', title: 'B', description: 'Desc B', quarter: '2026-Q1', status: 'done' },
    { id: '3', title: 'C', description: 'Desc C', quarter: '2026-Q1', status: 'now' },
    { id: '4', title: 'D', description: 'Desc D', quarter: '2026-Q3', status: 'later' },
  ];

  const samplePhases: RoadmapPhase[] = [
    { id: 'p1', number: 1, title: 'Phase 1', status: 'done', items: ['Item 1'] },
    { id: 'p2', number: 2, title: 'Phase 2', status: 'now', items: ['Item 2'] },
  ];

  it('groups and sorts milestones by quarter chronologically', () => {
    const quarters = groupMilestonesByQuarter(sampleMilestones);
    expect(quarters).toHaveLength(3);
    expect(quarters[0].quarter).toBe('2026-Q1');
    expect(quarters[0].formattedQuarter).toBe('2026 · Q1');
    expect(quarters[0].items).toHaveLength(2);
    expect(quarters[0].doneCount).toBe(1);
    expect(quarters[0].percentComplete).toBe(50);

    expect(quarters[1].quarter).toBe('2026-Q2');
    expect(quarters[1].formattedQuarter).toBe('2026 · Q2');
    expect(quarters[1].items).toHaveLength(1);
    expect(quarters[1].doneCount).toBe(0);
    expect(quarters[1].percentComplete).toBe(0);

    expect(quarters[2].quarter).toBe('2026-Q3');
    expect(quarters[2].formattedQuarter).toBe('2026 · Q3');
    expect(quarters[2].items).toHaveLength(1);
    expect(quarters[2].doneCount).toBe(0);
    expect(quarters[2].percentComplete).toBe(0);
  });

  it('handles empty milestones when grouping by quarter', () => {
    const quarters = groupMilestonesByQuarter([]);
    expect(quarters).toEqual([]);
  });

  it('groups milestones into standard horizons in fixed order with correct metadata', () => {
    const horizons = groupMilestonesByHorizon(sampleMilestones);
    expect(horizons).toHaveLength(4);

    expect(horizons[0]).toMatchObject({
      horizon: 'now',
      label: 'Now · In Progress',
      badgeTone: 'accent',
      count: 1,
    });
    expect(horizons[0].items[0].id).toBe('3');

    expect(horizons[1]).toMatchObject({
      horizon: 'next',
      label: 'Next · Upcoming',
      badgeTone: 'warn',
      count: 1,
    });
    expect(horizons[1].items[0].id).toBe('1');

    expect(horizons[2]).toMatchObject({
      horizon: 'later',
      label: 'Later · Horizon',
      badgeTone: 'default',
      count: 1,
    });
    expect(horizons[2].items[0].id).toBe('4');

    expect(horizons[3]).toMatchObject({
      horizon: 'done',
      label: 'Done · Completed',
      badgeTone: 'ok',
      count: 1,
    });
    expect(horizons[3].items[0].id).toBe('2');
  });

  it('returns all 4 horizons even when no milestones match', () => {
    const horizons = groupMilestonesByHorizon([]);
    expect(horizons).toHaveLength(4);
    for (const h of horizons) {
      expect(h.items).toEqual([]);
      expect(h.count).toBe(0);
    }
  });

  it('computes summary metrics accurately', () => {
    const summary = computeRoadmapSummary(samplePhases, sampleMilestones);
    expect(summary.totalMilestones).toBe(4);
    expect(summary.completedMilestones).toBe(1);
    expect(summary.activeMilestones).toBe(1);
    expect(summary.upcomingMilestones).toBe(1);
    expect(summary.overallPercentComplete).toBe(25);
    expect(summary.totalPhases).toBe(2);
    expect(summary.completedPhases).toBe(1);
  });

  it('handles empty phases and milestones without division by zero', () => {
    const summary = computeRoadmapSummary([], []);
    expect(summary).toEqual({
      totalMilestones: 0,
      completedMilestones: 0,
      activeMilestones: 0,
      upcomingMilestones: 0,
      overallPercentComplete: 0,
      totalPhases: 0,
      completedPhases: 0,
    });
  });

  it('rounds overall percent completion properly', () => {
    const oneOfThreeDone: RoadmapMilestone[] = [
      { id: '1', title: '1', description: '', quarter: '2026-Q1', status: 'done' },
      { id: '2', title: '2', description: '', quarter: '2026-Q1', status: 'now' },
      { id: '3', title: '3', description: '', quarter: '2026-Q1', status: 'next' },
    ];
    const summary = computeRoadmapSummary([], oneOfThreeDone);
    expect(summary.overallPercentComplete).toBe(33); // Math.round(1/3 * 100) = 33
  });
});
