import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { memoizedReadFile } from '../file-memo';
import type {
  ExecutiveAnalyticsReport,
  MetricTile,
  PendingMetric,
  DistributionChartData,
  DistributionSlice,
  DailyVolumePoint,
} from './types';

const THEME_COLORS = ['#22c55e', '#38bdf8', '#fbbf24', '#a855f7', '#f43f5e', '#e2e8f0'];

function formatCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toLocaleString('en-US');
}

function generateSparkline(baseValue: number, count = 7): number[] {
  return Array(count).fill(baseValue);
}

function generate14dEmptyPoints(): DailyVolumePoint[] {
  const points: DailyVolumePoint[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    points.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return points;
}

export async function computeExecutiveAnalytics(
  companyRoot: string,
  companyId: string,
  companyName = companyId,
): Promise<ExecutiveAnalyticsReport> {
  const liveMetrics: MetricTile[] = [];
  const pendingMetrics: PendingMetric[] = [];
  let expenseDonut: DistributionChartData | null = null;
  let pipelineDonut: DistributionChartData | null = null;
  let audienceDonut: DistributionChartData | null = null;

  // 1. Finances
  const txPath = path.join(companyRoot, 'records/finances/transactions.yaml');
  try {
    const raw = await memoizedReadFile(txPath);
    const parsed = parseYaml(raw);
    const txs: Array<{ amount: number; type?: string; category?: string }> = Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.transactions)
      ? parsed.transactions
      : [];

    if (txs.length > 0) {
      let totalExpense = 0;
      const categoryMap = new Map<string, number>();

      for (const tx of txs) {
        const isExpense = tx.type === 'expense' || (typeof tx.amount === 'number' && tx.amount < 0);
        if (isExpense) {
          const expense = Math.abs(tx.amount);
          totalExpense += expense;
          const cat = tx.category?.toLowerCase() ?? 'uncategorized';
          categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + expense);
        }
      }

      liveMetrics.push({
        id: 'monthly-burn',
        label: 'Monthly Burn',
        unit: 'usd',
        value: totalExpense,
        formattedValue: formatCurrency(totalExpense),
        source: 'Finances',
        sparkline: generateSparkline(totalExpense),
        href: `/c/${companyId}/finances`,
      });

      if (totalExpense > 0 && categoryMap.size > 0) {
        const slices: DistributionSlice[] = Array.from(categoryMap.entries()).map(([cat, val], idx) => ({
          key: cat,
          label: cat.charAt(0).toUpperCase() + cat.slice(1),
          value: val,
          percentage: Math.round((val / totalExpense) * 100),
          color: THEME_COLORS[idx % THEME_COLORS.length],
        }));

        expenseDonut = {
          id: 'expenses',
          title: 'Financial Outflow',
          subtitle: `${formatCurrency(totalExpense)} total spend`,
          total: totalExpense,
          formattedTotal: formatCurrency(totalExpense),
          centerLabel: 'monthly burn',
          slices,
        };
      }
    } else {
      pendingMetrics.push({
        id: 'finances',
        label: 'Monthly Burn',
        department: 'finances',
        reason: 'No transactions recorded in records/finances/transactions.yaml',
        actionLabel: 'View Finances',
        actionHref: `/c/${companyId}/finances`,
      });
    }
  } catch {
    pendingMetrics.push({
      id: 'finances',
      label: 'Monthly Burn',
      department: 'finances',
      reason: 'No transactions file found in records/finances/transactions.yaml',
      actionLabel: 'View Finances',
      actionHref: `/c/${companyId}/finances`,
    });
  }

  // 2. Funnel
  const leadsPath = path.join(companyRoot, 'records/funnel/leads.yaml');
  try {
    const raw = await memoizedReadFile(leadsPath);
    const parsed = parseYaml(raw);
    const leads: Array<{ name: string; stage?: string; estimatedValue?: number; value?: number }> = Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.leads)
      ? parsed.leads
      : [];

    if (leads.length > 0) {
      let totalValue = 0;
      const stageMap = new Map<string, number>();

      for (const lead of leads) {
        const val = typeof lead.value === 'number' ? lead.value : typeof lead.estimatedValue === 'number' ? lead.estimatedValue : 0;
        totalValue += val;
        const stage = lead.stage?.toLowerCase() ?? 'lead';
        stageMap.set(stage, (stageMap.get(stage) ?? 0) + (val > 0 ? val : 1));
      }

      liveMetrics.push({
        id: 'pipeline-value',
        label: 'Pipeline Value',
        unit: 'usd',
        value: totalValue,
        formattedValue: formatCurrency(totalValue),
        source: 'Sales Funnel',
        sparkline: generateSparkline(totalValue),
        href: `/c/${companyId}/funnel`,
      });

      const totalStageWeight = Array.from(stageMap.values()).reduce((sum, v) => sum + v, 0);
      if (totalStageWeight > 0) {
        const slices: DistributionSlice[] = Array.from(stageMap.entries()).map(([stg, val], idx) => ({
          key: stg,
          label: stg.charAt(0).toUpperCase() + stg.slice(1),
          value: val,
          percentage: Math.round((val / totalStageWeight) * 100),
          color: THEME_COLORS[idx % THEME_COLORS.length],
        }));

        pipelineDonut = {
          id: 'pipeline',
          title: 'Pipeline Breakdown',
          subtitle: `${leads.length} active leads`,
          total: totalValue,
          formattedTotal: formatCurrency(totalValue),
          centerLabel: 'pipeline deals',
          slices,
        };
      }
    } else {
      pendingMetrics.push({
        id: 'funnel',
        label: 'Open Pipeline',
        department: 'funnel',
        reason: 'No leads found in records/funnel/leads.yaml',
        actionLabel: 'View Funnel',
        actionHref: `/c/${companyId}/funnel`,
      });
    }
  } catch {
    pendingMetrics.push({
      id: 'funnel',
      label: 'Open Pipeline',
      department: 'funnel',
      reason: 'No leads file found in records/funnel/leads.yaml',
      actionLabel: 'View Funnel',
      actionHref: `/c/${companyId}/funnel`,
    });
  }

  // 3. Social / Audience
  const socialPath = path.join(companyRoot, 'records/social/snapshots.yaml');
  try {
    const raw = await memoizedReadFile(socialPath);
    const parsed = parseYaml(raw);
    const snapshots: Array<{
      date: string;
      totalFollowers?: number;
      followers?: number;
      byPlatform?: Record<string, number>;
    }> = Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.snapshots)
      ? parsed.snapshots
      : [];

    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : latest;
      const currentFollowers = latest.totalFollowers ?? latest.followers ?? 0;
      const prevFollowers = prev.totalFollowers ?? prev.followers ?? currentFollowers;
      const deltaPct =
        prevFollowers > 0
          ? Math.round(((currentFollowers - prevFollowers) / prevFollowers) * 100)
          : 0;

      liveMetrics.push({
        id: 'audience-reach',
        label: 'Audience Reach',
        unit: 'followers',
        value: currentFollowers,
        formattedValue: formatFollowers(currentFollowers),
        delta: deltaPct,
        deltaPct: true,
        source: 'Social & Comms',
        sparkline:
          snapshots.length >= 2
            ? snapshots.slice(-7).map((s) => s.totalFollowers ?? s.followers ?? 0)
            : generateSparkline(currentFollowers),
        href: `/c/${companyId}/social`,
      });

      if (latest.byPlatform && Object.keys(latest.byPlatform).length > 0) {
        const entries = Object.entries(latest.byPlatform);
        const platformTotal = entries.reduce((s, [, v]) => s + v, 0);
        const slices: DistributionSlice[] = entries.map(([plat, val], idx) => ({
          key: plat,
          label: plat.charAt(0).toUpperCase() + plat.slice(1),
          value: val,
          percentage: platformTotal > 0 ? Math.round((val / platformTotal) * 100) : 0,
          color: THEME_COLORS[idx % THEME_COLORS.length],
        }));

        audienceDonut = {
          id: 'audience',
          title: 'Audience Share',
          subtitle: `${formatFollowers(currentFollowers)} total reach`,
          total: currentFollowers,
          formattedTotal: formatFollowers(currentFollowers),
          centerLabel: 'total followers',
          slices,
        };
      }
    } else {
      pendingMetrics.push({
        id: 'social',
        label: 'Audience Reach',
        department: 'social',
        reason: 'No snapshots recorded in records/social/snapshots.yaml',
        actionLabel: 'View Social',
        actionHref: `/c/${companyId}/social`,
      });
    }
  } catch {
    pendingMetrics.push({
      id: 'social',
      label: 'Audience Reach',
      department: 'social',
      reason: 'No snapshots file found in records/social/snapshots.yaml',
      actionLabel: 'View Social',
      actionHref: `/c/${companyId}/social`,
    });
  }

  // 4. Content Cadence
  const contentPath = path.join(companyRoot, 'records/content/items.yaml');
  try {
    const raw = await memoizedReadFile(contentPath);
    const parsed = parseYaml(raw);
    const items: Array<{ title: string; status?: string }> = Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.items)
      ? parsed.items
      : [];

    if (items.length > 0) {
      const published = items.filter((i) => i.status === 'published').length;
      liveMetrics.push({
        id: 'content-cadence',
        label: 'Content Velocity',
        unit: 'items',
        value: items.length,
        formattedValue: `${items.length} items`,
        delta: published,
        deltaPct: false,
        source: 'Content Hub',
        sparkline: generateSparkline(items.length),
        href: `/c/${companyId}/content`,
      });
    }
  } catch {
    // optional, no hard failure
  }

  // 5. Workflows
  const workflowsPath = path.join(companyRoot, 'records/workflows/processes.yaml');
  try {
    const raw = await memoizedReadFile(workflowsPath);
    const parsed = parseYaml(raw);
    const processes: Array<{ name: string; leakPct?: number }> = Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.processes)
      ? parsed.processes
      : [];

    if (processes.length > 0) {
      const bottlenecks = processes.filter((p) => (p.leakPct ?? 0) > 0).length;
      liveMetrics.push({
        id: 'active-processes',
        label: 'Active Workflows',
        unit: 'processes',
        value: processes.length,
        formattedValue: `${processes.length} tracks`,
        delta: bottlenecks,
        deltaPct: false,
        deltaTone: bottlenecks > 0 ? 'warn' : 'ok',
        source: 'Workflows',
        sparkline: generateSparkline(processes.length),
        href: `/c/${companyId}/workflows`,
      });
    }
  } catch {
    // optional
  }

  // 6. 14-Day Activity Points
  const points = generate14dEmptyPoints();
  const total14d = points.reduce((sum, p) => sum + p.count, 0);

  return {
    companyId,
    companyName,
    liveMetrics,
    pendingMetrics,
    distributions: {
      expenses: expenseDonut,
      pipeline: pipelineDonut,
      audience: audienceDonut,
    },
    activityVolume: {
      points,
      total14d,
    },
  };
}
