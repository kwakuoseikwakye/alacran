export type MetricUnit = 'usd' | 'followers' | 'deals' | 'items' | 'runs' | 'processes';

export interface MetricTile {
  id: string;
  label: string;
  unit: MetricUnit;
  value: number;
  formattedValue: string;
  delta?: number;
  deltaPct?: boolean;
  deltaTone?: 'ok' | 'warn' | 'err' | 'neutral';
  source: string;
  sparkline: number[];
  href?: string;
}

export interface PendingMetric {
  id: string;
  label: string;
  department: string;
  reason: string;
  actionLabel: string;
  actionHref: string;
}

export interface DistributionSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  percentage: number;
}

export interface DistributionChartData {
  id: string;
  title: string;
  subtitle: string;
  total: number;
  formattedTotal: string;
  centerLabel: string;
  slices: DistributionSlice[];
}

export interface DailyVolumePoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface ExecutiveAnalyticsReport {
  companyId: string;
  companyName: string;
  liveMetrics: MetricTile[];
  pendingMetrics: PendingMetric[];
  distributions: {
    expenses: DistributionChartData | null;
    pipeline: DistributionChartData | null;
    audience: DistributionChartData | null;
  };
  activityVolume: {
    points: DailyVolumePoint[];
    total14d: number;
  };
}
