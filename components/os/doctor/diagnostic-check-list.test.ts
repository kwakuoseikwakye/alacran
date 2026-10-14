import { describe, it, expect } from 'vitest';
import { filterChecks } from './diagnostic-check-list';
import type { DiagnosticCheckResult } from '@/lib/os/doctor/types';

describe('Diagnostic Check List Filtering', () => {
  const sampleChecks: DiagnosticCheckResult[] = [
    { id: '1', title: 'A', category: 'repository', status: 'pass', weight: 10, earnedPoints: 10, message: 'ok' },
    { id: '2', title: 'B', category: 'connectors', status: 'warn', weight: 8, earnedPoints: 4, message: 'warn' },
    { id: '3', title: 'C', category: 'records', status: 'fail', weight: 15, earnedPoints: 0, message: 'fail' },
  ];

  it('filters by issues and passing tabs', () => {
    expect(filterChecks(sampleChecks, 'all')).toHaveLength(3);
    expect(filterChecks(sampleChecks, 'issues')).toEqual([sampleChecks[1], sampleChecks[2]]);
    expect(filterChecks(sampleChecks, 'passing')).toEqual([sampleChecks[0]]);
  });

  it('handles empty checks array gracefully', () => {
    expect(filterChecks([], 'all')).toEqual([]);
    expect(filterChecks([], 'issues')).toEqual([]);
    expect(filterChecks([], 'passing')).toEqual([]);
  });

  it('returns all checks when filter is all', () => {
    const all = filterChecks(sampleChecks, 'all');
    expect(all).toHaveLength(3);
    expect(all).toBe(sampleChecks);
  });

  it('correctly filters checks with command and slashCommand remediations', () => {
    const remediationChecks: DiagnosticCheckResult[] = [
      {
        id: 'r1',
        title: 'Git Status',
        category: 'repository',
        status: 'warn',
        weight: 10,
        earnedPoints: 5,
        message: 'Uncommitted changes',
        remediation: { actionLabel: 'Commit', command: 'git commit -m "update"' },
      },
      {
        id: 'r2',
        title: 'Define Company',
        category: 'repository',
        status: 'fail',
        weight: 15,
        earnedPoints: 0,
        message: 'Missing company ontology',
        remediation: { actionLabel: 'Define', slashCommand: '/define-company' },
      },
      {
        id: 'r3',
        title: 'Beeper Connection',
        category: 'connectors',
        status: 'pass',
        weight: 10,
        earnedPoints: 10,
        message: 'Beeper CLI operational',
      },
    ];

    expect(filterChecks(remediationChecks, 'issues')).toHaveLength(2);
    expect(filterChecks(remediationChecks, 'passing')).toHaveLength(1);
    expect(remediationChecks[1].remediation?.slashCommand).toBe('/define-company');
  });
});
