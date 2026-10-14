import React from 'react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/os/dashboard/page-header';
import { RoadmapCanvas } from '@/components/os/roadmap/roadmap-canvas';
import { readRoadmap } from '@/lib/os/roadmap/read';
import { getActiveCompanyRoot } from '@/lib/os/active-company';
import { getEffectiveAgents } from '@/lib/get-effective-agents';

export const dynamic = 'force-dynamic';

export default async function RoadmapPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const companyRoot = await getActiveCompanyRoot(companyId);

  if (!companyRoot) {
    notFound();
  }

  const [roadmap, agents] = await Promise.all([
    readRoadmap(companyRoot),
    getEffectiveAgents(),
  ]);

  const activeAgent = agents.find((a) => a.id === companyId);
  const departmentMap: Record<string, string> = {
    operations: 'Operations & Engineering',
    finances: 'Finances & Billing',
    funnel: 'Funnel & Sales',
    social: 'Social & Audience',
    content: 'Content & Publishing',
  };

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Roadmap"
        subtext={`What ${activeAgent?.name ?? companyId} wants to get done, and roughly when`}
      />

      <RoadmapCanvas
        companyId={companyId}
        roadmap={roadmap}
        departmentMap={departmentMap}
      />
    </div>
  );
}
