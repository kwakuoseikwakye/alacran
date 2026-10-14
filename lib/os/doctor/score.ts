import type { CheckCategory, DiagnosticCheckResult, DoctorReport, HealthGrade } from './types';

export function computeHealthGrade(overallScore: number): HealthGrade {
  if (overallScore >= 90) return 'Optimal';
  if (overallScore >= 75) return 'Operational';
  if (overallScore >= 50) return 'Degraded';
  return 'Critical';
}

const CATEGORY_MAX: Record<CheckCategory, number> = {
  repository: 40,
  connectors: 30,
  records: 30,
};

export function computeDoctorScore(
  checks: DiagnosticCheckResult[],
  timestamp?: string,
): DoctorReport {
  const repositoryChecks = checks.filter((c) => c.category === 'repository');
  const connectorsChecks = checks.filter((c) => c.category === 'connectors');
  const recordsChecks = checks.filter((c) => c.category === 'records');

  const repoScore = repositoryChecks.reduce((acc, c) => acc + c.earnedPoints, 0);
  const connScore = connectorsChecks.reduce((acc, c) => acc + c.earnedPoints, 0);
  const recScore = recordsChecks.reduce((acc, c) => acc + c.earnedPoints, 0);

  const clampedRepo = Math.max(0, Math.min(CATEGORY_MAX.repository, repoScore));
  const clampedConn = Math.max(0, Math.min(CATEGORY_MAX.connectors, connScore));
  const clampedRec = Math.max(0, Math.min(CATEGORY_MAX.records, recScore));

  const overallScore = Math.min(100, Math.max(0, clampedRepo + clampedConn + clampedRec));
  const grade = computeHealthGrade(overallScore);

  return {
    timestamp: timestamp ?? new Date().toISOString(),
    overallScore,
    grade,
    categories: {
      repository: { score: clampedRepo, max: CATEGORY_MAX.repository, checks: repositoryChecks },
      connectors: { score: clampedConn, max: CATEGORY_MAX.connectors, checks: connectorsChecks },
      records: { score: clampedRec, max: CATEGORY_MAX.records, checks: recordsChecks },
    },
    checks,
  };
}
