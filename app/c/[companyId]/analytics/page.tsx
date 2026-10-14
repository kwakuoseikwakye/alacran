import React from 'react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/os/dashboard/page-header';
import { AnalyticsCanvas } from '@/components/os/analytics/analytics-canvas';
import { computeExecutiveAnalytics } from '@/lib/os/analytics/engine';
import { getActiveCompanyRoot } from '@/lib/os/active-company';
import { getEffectiveAgents } from '@/lib/get-effective-agents';

export const dynamic = 'force-dynamic';

function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'accent' | 'ok' | 'warn';
}) {
  const tones = {
    default: 'bg-os-surface2 text-os-dim border-os-border',
    accent: 'bg-os-accent/10 text-os-accent border-os-accent/20',
    ok: 'bg-os-ok/10 text-os-ok border-os-ok/20',
    warn: 'bg-os-warn/10 text-os-warn border-os-warn/20',
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide uppercase ${
        tones[tone] ?? tones.default
      }`}
    >
      {children}
    </span>
  );
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const [companyRoot, agents] = await Promise.all([
    getActiveCompanyRoot(companyId),
    getEffectiveAgents(),
  ]);

  if (!companyRoot) {
    notFound();
  }

  const activeAgent = agents.find((a) => a.id === companyId);
  const report = await computeExecutiveAnalytics(
    companyRoot,
    companyId,
    activeAgent?.name ?? companyId,
  );

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Executive Analytics"
        subtext={`Cross-department executive performance for ${
          activeAgent?.name ?? companyId
        } · Plain-files verified`}
        right={
          <Badge tone="accent">
            {report.liveMetrics.length} live · {report.pendingMetrics.length} pending
          </Badge>
        }
      />

      <AnalyticsCanvas report={report} />
    </div>
  );
}
