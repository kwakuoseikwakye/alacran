import { checkRepository } from './checks/repository';
import { checkConnectors } from './checks/connectors';
import { checkRecords } from './checks/records';
import { computeDoctorScore } from './score';
import type { CheckCategory, DiagnosticCheckResult, DoctorReport } from './types';

export { checkRepository } from './checks/repository';
export { checkConnectors } from './checks/connectors';
export { checkRecords } from './checks/records';

export async function runDoctor(companyRoot: string): Promise<DoctorReport> {
  const suites: { category: CheckCategory; runner: () => Promise<DiagnosticCheckResult[]> }[] = [
    { category: 'repository', runner: () => checkRepository(companyRoot) },
    { category: 'connectors', runner: () => checkConnectors(companyRoot) },
    { category: 'records', runner: () => checkRecords(companyRoot) },
  ];

  const settled = await Promise.allSettled(suites.map((s) => s.runner()));

  const allChecks: DiagnosticCheckResult[] = [];
  settled.forEach((res, index) => {
    const { category } = suites[index];
    if (res.status === 'fulfilled') {
      allChecks.push(...res.value);
    } else {
      const reasonMsg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      allChecks.push({
        id: `${category}-suite-error`,
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} Suite Error`,
        category,
        status: 'fail',
        weight: 10,
        earnedPoints: 0,
        message: `Check suite failed to run: ${reasonMsg}`,
      });
    }
  });

  return computeDoctorScore(allChecks);
}
