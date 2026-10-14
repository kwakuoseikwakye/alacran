import type { RoadmapMilestone, RoadmapPhase } from '../schemas/roadmap';

export interface QuarterGroup {
  quarter: string;
  formattedQuarter: string;
  items: RoadmapMilestone[];
  doneCount: number;
  totalCount: number;
  percentComplete: number;
}

export interface HorizonGroup {
  horizon: 'now' | 'next' | 'later' | 'done';
  label: string;
  badgeTone: 'accent' | 'warn' | 'default' | 'ok';
  items: RoadmapMilestone[];
  count: number;
}

export interface RoadmapSummaryStats {
  totalMilestones: number;
  completedMilestones: number;
  activeMilestones: number;
  upcomingMilestones: number;
  overallPercentComplete: number;
  totalPhases: number;
  completedPhases: number;
}

export function groupMilestonesByQuarter(items: RoadmapMilestone[]): QuarterGroup[] {
  const byQuarter = new Map<string, RoadmapMilestone[]>();
  for (const item of items) {
    const bucket = byQuarter.get(item.quarter) ?? [];
    bucket.push(item);
    byQuarter.set(item.quarter, bucket);
  }

  return [...byQuarter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, quarterItems]) => {
      const doneCount = quarterItems.filter((r) => r.status === 'done').length;
      const totalCount = quarterItems.length;
      const percentComplete = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
      return {
        quarter,
        formattedQuarter: quarter.replace('-', ' · '),
        items: quarterItems,
        doneCount,
        totalCount,
        percentComplete,
      };
    });
}

export function groupMilestonesByHorizon(items: RoadmapMilestone[]): HorizonGroup[] {
  const configs: Array<{
    horizon: 'now' | 'next' | 'later' | 'done';
    label: string;
    badgeTone: 'accent' | 'warn' | 'default' | 'ok';
  }> = [
    { horizon: 'now', label: 'Now · In Progress', badgeTone: 'accent' },
    { horizon: 'next', label: 'Next · Upcoming', badgeTone: 'warn' },
    { horizon: 'later', label: 'Later · Horizon', badgeTone: 'default' },
    { horizon: 'done', label: 'Done · Completed', badgeTone: 'ok' },
  ];

  return configs.map((cfg) => {
    const horizonItems = items.filter((item) => item.status === cfg.horizon);
    return {
      ...cfg,
      items: horizonItems,
      count: horizonItems.length,
    };
  });
}

export function computeRoadmapSummary(
  phases: RoadmapPhase[],
  milestones: RoadmapMilestone[],
): RoadmapSummaryStats {
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m) => m.status === 'done').length;
  const activeMilestones = milestones.filter((m) => m.status === 'now').length;
  const upcomingMilestones = milestones.filter((m) => m.status === 'next').length;
  const overallPercentComplete =
    totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  const totalPhases = phases.length;
  const completedPhases = phases.filter((p) => p.status === 'done').length;

  return {
    totalMilestones,
    completedMilestones,
    activeMilestones,
    upcomingMilestones,
    overallPercentComplete,
    totalPhases,
    completedPhases,
  };
}
