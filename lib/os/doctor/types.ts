export type CheckStatus = 'pass' | 'warn' | 'fail';
export type HealthGrade = 'Optimal' | 'Operational' | 'Degraded' | 'Critical';
export type CheckCategory = 'repository' | 'connectors' | 'records';

export interface DiagnosticCheckResult {
  id: string;
  title: string;
  category: CheckCategory;
  status: CheckStatus;
  weight: number;
  earnedPoints: number;
  message: string;
  remediation?: {
    actionLabel: string;
    command?: string;
    fileTarget?: string;
    slashCommand?: string;
  };
}

export interface CategoryScore {
  score: number;
  max: number;
  checks: DiagnosticCheckResult[];
}

export interface DoctorReport {
  timestamp: string;
  overallScore: number;
  grade: HealthGrade;
  categories: {
    repository: CategoryScore;
    connectors: CategoryScore;
    records: CategoryScore;
  };
  checks: DiagnosticCheckResult[];
}
