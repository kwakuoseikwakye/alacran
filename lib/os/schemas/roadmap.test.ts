import { describe, it, expect } from 'vitest';
import {
  RoadmapFileSchema,
  RoadmapMilestoneSchema,
  RoadmapPhaseSchema,
  RoadmapStatusEnum,
} from './roadmap';

describe('Roadmap Zod Schemas', () => {
  it('validates RoadmapStatusEnum values', () => {
    expect(RoadmapStatusEnum.parse('done')).toBe('done');
    expect(RoadmapStatusEnum.parse('now')).toBe('now');
    expect(RoadmapStatusEnum.parse('next')).toBe('next');
    expect(RoadmapStatusEnum.parse('later')).toBe('later');
    expect(() => RoadmapStatusEnum.parse('invalid')).toThrow();
  });

  it('validates a correct roadmap phase record', () => {
    const valid = {
      id: 'p1',
      number: 1,
      title: 'Foundation',
      status: 'now' as const,
      items: ['Design System', 'DB Setup'],
    };
    expect(RoadmapPhaseSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid phase numbers (negative or zero or non-integer)', () => {
    expect(() =>
      RoadmapPhaseSchema.parse({
        id: 'p1',
        number: 0,
        title: 'Zero Phase',
        status: 'now',
        items: [],
      })
    ).toThrow();

    expect(() =>
      RoadmapPhaseSchema.parse({
        id: 'p1',
        number: -1,
        title: 'Negative Phase',
        status: 'now',
        items: [],
      })
    ).toThrow();
  });

  it('validates a correct roadmap milestone record with all fields', () => {
    const valid = {
      id: 'ms-01',
      title: 'Shell Replication',
      description: 'Replicate FounderOS shell',
      quarter: '2026-Q1',
      status: 'done' as const,
      departmentId: 'operations',
      targetDate: '2026-03-31',
      deliverable: 'v0.60.0',
      gateCheckpoint: 'publication' as const,
    };
    expect(RoadmapMilestoneSchema.parse(valid)).toEqual(valid);
  });

  it('validates milestone record with only required fields', () => {
    const minimal = {
      id: 'ms-02',
      title: 'Minimal Milestone',
      description: 'Only required fields',
      quarter: '2026-Q3',
      status: 'later' as const,
    };
    expect(RoadmapMilestoneSchema.parse(minimal)).toEqual(minimal);
  });

  it('validates milestone record with null optional fields', () => {
    const withNulls = {
      id: 'ms-03',
      title: 'Milestone with Nulls',
      description: 'Null optional fields',
      quarter: '2026-Q4',
      status: 'next' as const,
      departmentId: null,
      targetDate: null,
      deliverable: null,
      gateCheckpoint: null,
    };
    expect(RoadmapMilestoneSchema.parse(withNulls)).toEqual(withNulls);
  });

  it('rejects invalid quarter format regex', () => {
    const invalid = {
      id: 'ms-02',
      title: 'Bad Quarter',
      description: 'Invalid quarter format',
      quarter: '2026-Q5',
      status: 'now' as const,
    };
    expect(() => RoadmapMilestoneSchema.parse(invalid)).toThrow();
  });

  it('validates complete roadmap file schema and defaults missing arrays', () => {
    const file = {
      phases: [
        { id: 'p1', number: 1, title: 'Phase 1', status: 'done' as const, items: ['Task A', 'Task B'] },
      ],
      milestones: [
        { id: 'm1', title: 'M1', description: 'Desc', quarter: '2026-Q2', status: 'next' as const },
      ],
    };
    expect(RoadmapFileSchema.parse(file)).toEqual(file);

    const empty = {};
    expect(RoadmapFileSchema.parse(empty)).toEqual({ phases: [], milestones: [] });
  });
});
