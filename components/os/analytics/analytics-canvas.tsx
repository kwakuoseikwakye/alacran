'use client';

import React from 'react';
import type { ExecutiveAnalyticsReport } from '@/lib/os/analytics/types';
import { MetricCard } from './metric-card';
import { ShareDonutCard } from './share-donut';
import { ActivityVolumeChart } from './activity-chart';
import { PendingSourcesCard } from './pending-sources';

export function AnalyticsCanvas({ report }: { report: ExecutiveAnalyticsReport }) {
  const { liveMetrics, pendingMetrics, distributions, activityVolume } = report;

  return (
    <div className="space-y-8">
      {/* 1. Live Operating KPI Tiles */}
      {liveMetrics.length > 0 && (
        <section aria-label="Executive Performance Indicators">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-os-dim">
              Executive Performance · {liveMetrics.length}{' '}
              {liveMetrics.length === 1 ? 'active indicator' : 'active indicators'}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {liveMetrics.map((tile) => (
              <MetricCard key={tile.id} tile={tile} />
            ))}
          </div>
        </section>
      )}

      {/* 2. Triple Distribution Row */}
      {(distributions.expenses || distributions.pipeline || distributions.audience) && (
        <section aria-label="Cross-Department Distributions">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-os-dim">
              Cross-Department Distribution · Share of Totals
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {distributions.expenses && <ShareDonutCard data={distributions.expenses} />}
            {distributions.pipeline && <ShareDonutCard data={distributions.pipeline} />}
            {distributions.audience && <ShareDonutCard data={distributions.audience} />}
          </div>
        </section>
      )}

      {/* 3. Bottom Grid: 14d Execution Volume & Inactive Records */}
      <section aria-label="Execution Volume and Inactive Records">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivityVolumeChart
              data={activityVolume.points}
              total14d={activityVolume.total14d}
            />
          </div>
          <div>
            <PendingSourcesCard pending={pendingMetrics} />
          </div>
        </div>
      </section>
    </div>
  );
}
