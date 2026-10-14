import React from 'react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/os/dashboard/page-header';
import { SkillsCanvas } from '@/components/os/skills/skills-canvas';
import { Badge } from '@/components/os/badge';
import { readSkillsCatalog } from '@/lib/os/skills/catalog';
import { getActiveCompanyRoot } from '@/lib/os/active-company';
import { getEffectiveAgents } from '@/lib/get-effective-agents';
import { observeGuide } from '@/lib/guide/observe';
import type { GuideState } from '@/lib/guide/refresh';
import { GuideCard } from '@/components/os/guide/guide-card';

export const dynamic = 'force-dynamic';

export default async function SkillsPage({
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

  const view = await observeGuide({ id: companyId, rootPath: companyRoot });
  const guide: GuideState = view.result.kind === 'proposal' ? { state: 'stale' } : view.result.state;
  const counts = view.result.kind === 'proposal' ? view.result.proposal.counts : null;

  const activeAgent = agents.find((a) => a.id === companyId);
  const skills = await readSkillsCatalog(
    companyRoot,
    activeAgent?.name ?? companyId,
  );

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Skills & Commands"
        subtext={`Operating capabilities and AI agent skills for ${
          activeAgent?.name ?? companyId
        } · Plain-files verified`}
        right={
          <Badge tone="accent">
            {skills.length} capabilities
          </Badge>
        }
      />

      <GuideCard companyId={companyId} state={guide} counts={counts} dismissed={view.dismissed} />

      <SkillsCanvas
        skills={skills}
        companyId={companyId}
        companyName={activeAgent?.name ?? companyId}
      />
    </div>
  );
}
