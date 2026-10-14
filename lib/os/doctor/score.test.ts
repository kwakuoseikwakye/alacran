import { describe, it, expect } from 'vitest';
import { computeDoctorScore, computeHealthGrade } from './score';
import type { DiagnosticCheckResult } from './types';

describe('Doctor Scoring Engine', () => {
  it('assigns correct health grades based on thresholds', () => {
    expect(computeHealthGrade(100)).toBe('Optimal');
    expect(computeHealthGrade(90)).toBe('Optimal');
    expect(computeHealthGrade(89)).toBe('Operational');
    expect(computeHealthGrade(75)).toBe('Operational');
    expect(computeHealthGrade(74)).toBe('Degraded');
    expect(computeHealthGrade(50)).toBe('Degraded');
    expect(computeHealthGrade(49)).toBe('Critical');
    expect(computeHealthGrade(0)).toBe('Critical');
  });

  it('calculates perfect 100-point score when all checks pass', () => {
    const checks: DiagnosticCheckResult[] = [
      { id: 'repo-secrets', title: 'Secrets', category: 'repository', status: 'pass', weight: 10, earnedPoints: 10, message: 'ok' },
      { id: 'repo-ontology', title: 'Ontology', category: 'repository', status: 'pass', weight: 10, earnedPoints: 10, message: 'ok' },
      { id: 'repo-decisions', title: 'Decisions', category: 'repository', status: 'pass', weight: 10, earnedPoints: 10, message: 'ok' },
      { id: 'repo-agreements', title: 'Agreements', category: 'repository', status: 'pass', weight: 10, earnedPoints: 10, message: 'ok' },
      { id: 'conn-git', title: 'Git', category: 'connectors', status: 'pass', weight: 8, earnedPoints: 8, message: 'ok' },
      { id: 'conn-gh', title: 'GitHub', category: 'connectors', status: 'pass', weight: 8, earnedPoints: 8, message: 'ok' },
      { id: 'conn-runtimes', title: 'Runtimes', category: 'connectors', status: 'pass', weight: 7, earnedPoints: 7, message: 'ok' },
      { id: 'conn-creds', title: 'Credentials', category: 'connectors', status: 'pass', weight: 7, earnedPoints: 7, message: 'ok' },
      { id: 'data-records', title: 'Records', category: 'records', status: 'pass', weight: 15, earnedPoints: 15, message: 'ok' },
      { id: 'data-cross', title: 'Cross-refs', category: 'records', status: 'pass', weight: 15, earnedPoints: 15, message: 'ok' },
    ];

    const report = computeDoctorScore(checks);
    expect(report.overallScore).toBe(100);
    expect(report.grade).toBe('Optimal');
    expect(report.categories.repository.score).toBe(40);
    expect(report.categories.repository.max).toBe(40);
    expect(report.categories.connectors.score).toBe(30);
    expect(report.categories.connectors.max).toBe(30);
    expect(report.categories.records.score).toBe(30);
    expect(report.categories.records.max).toBe(30);
  });

  it('correctly deducts points for failures and warnings', () => {
    const checks: DiagnosticCheckResult[] = [
      { id: 'repo-secrets', title: 'Secrets', category: 'repository', status: 'fail', weight: 10, earnedPoints: 0, message: 'unignored secrets' },
      { id: 'repo-ontology', title: 'Ontology', category: 'repository', status: 'pass', weight: 10, earnedPoints: 10, message: 'ok' },
      { id: 'repo-decisions', title: 'Decisions', category: 'repository', status: 'pass', weight: 10, earnedPoints: 10, message: 'ok' },
      { id: 'repo-agreements', title: 'Agreements', category: 'repository', status: 'pass', weight: 10, earnedPoints: 10, message: 'ok' },
      { id: 'conn-git', title: 'Git', category: 'connectors', status: 'pass', weight: 8, earnedPoints: 8, message: 'ok' },
      { id: 'conn-gh', title: 'GitHub', category: 'connectors', status: 'warn', weight: 8, earnedPoints: 4, message: 'not authenticated' },
      { id: 'conn-runtimes', title: 'Runtimes', category: 'connectors', status: 'pass', weight: 7, earnedPoints: 7, message: 'ok' },
      { id: 'conn-creds', title: 'Credentials', category: 'connectors', status: 'pass', weight: 7, earnedPoints: 7, message: 'ok' },
      { id: 'data-records', title: 'Records', category: 'records', status: 'pass', weight: 15, earnedPoints: 15, message: 'ok' },
      { id: 'data-cross', title: 'Cross-refs', category: 'records', status: 'pass', weight: 15, earnedPoints: 15, message: 'ok' },
    ];

    const report = computeDoctorScore(checks);
    expect(report.overallScore).toBe(86);
    expect(report.grade).toBe('Operational');
    expect(report.categories.repository.score).toBe(30);
    expect(report.categories.connectors.score).toBe(26);
  });

  it('clamps category scores to [0, CATEGORY_MAX[cat]] defensively', () => {
    const overflowChecks: DiagnosticCheckResult[] = [
      { id: 'repo-1', title: 'R1', category: 'repository', status: 'pass', weight: 30, earnedPoints: 30, message: 'ok' },
      { id: 'repo-2', title: 'R2', category: 'repository', status: 'pass', weight: 30, earnedPoints: 30, message: 'ok' },
      { id: 'conn-1', title: 'C1', category: 'connectors', status: 'fail', weight: 10, earnedPoints: -5, message: 'err' },
    ];

    const report = computeDoctorScore(overflowChecks);
    expect(report.categories.repository.score).toBe(40); // clamped to CATEGORY_MAX.repository
    expect(report.categories.connectors.score).toBe(0); // clamped to 0
  });

  it('supports passing a custom timestamp', () => {
    const fixedTime = '2026-09-10T12:00:00.000Z';
    const report = computeDoctorScore([], fixedTime);
    expect(report.timestamp).toBe(fixedTime);
  });
});
