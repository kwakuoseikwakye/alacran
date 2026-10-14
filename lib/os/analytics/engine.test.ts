import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { computeExecutiveAnalytics } from './engine';

describe('Executive Analytics Engine', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alacran-analytics-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('computes live metrics and distribution charts when records exist', async () => {
    await fs.mkdir(path.join(tmpDir, 'records/finances'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/finances/transactions.yaml'),
      `transactions:
  - id: tx-1
    date: '2026-09-01'
    amount: -1200
    category: engineering
    description: Server hosting
  - id: tx-2
    date: '2026-09-05'
    amount: -800
    category: marketing
    description: Ad spend
`,
    );

    await fs.mkdir(path.join(tmpDir, 'records/funnel'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/funnel/leads.yaml'),
      `leads:
  - id: lead-1
    name: Alpha Corp
    stage: proposal
    estimatedValue: 15000
  - id: lead-2
    name: Beta LLC
    stage: discovery
    estimatedValue: 5000
`,
    );

    await fs.mkdir(path.join(tmpDir, 'records/social'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/social/snapshots.yaml'),
      `snapshots:
  - date: '2026-09-01'
    totalFollowers: 10000
  - date: '2026-09-10'
    totalFollowers: 11200
    byPlatform:
      twitter: 6200
      linkedin: 5000
`,
    );

    const report = await computeExecutiveAnalytics(tmpDir, 'test-co', 'Test Co');
    expect(report.companyId).toBe('test-co');
    expect(report.liveMetrics.length).toBeGreaterThanOrEqual(3);

    const burn = report.liveMetrics.find((m) => m.id === 'monthly-burn');
    expect(burn).toBeDefined();
    expect(burn?.value).toBe(2000);
    expect(burn?.formattedValue).toBe('$2,000');

    const pipeline = report.liveMetrics.find((m) => m.id === 'pipeline-value');
    expect(pipeline).toBeDefined();
    expect(pipeline?.value).toBe(20000);

    const audience = report.liveMetrics.find((m) => m.id === 'audience-reach');
    expect(audience).toBeDefined();
    expect(audience?.value).toBe(11200);
    expect(audience?.delta).toBe(12);
    expect(audience?.sparkline).toEqual([10000, 11200]);

    expect(report.distributions.expenses).not.toBeNull();
    expect(report.distributions.expenses?.slices).toHaveLength(2);

    expect(report.distributions.pipeline).not.toBeNull();
    expect(report.distributions.pipeline?.slices).toHaveLength(2);

    expect(report.distributions.audience).not.toBeNull();
    expect(report.distributions.audience?.slices).toHaveLength(2);

    expect(report.activityVolume.points).toHaveLength(14);
  });

  it('gracefully degrades missing records to pending metrics with honest action links', async () => {
    const report = await computeExecutiveAnalytics(tmpDir, 'empty-co', 'Empty Co');
    expect(report.liveMetrics).toHaveLength(0);
    expect(report.pendingMetrics.length).toBeGreaterThanOrEqual(3);

    const pendingFinance = report.pendingMetrics.find((p) => p.department === 'finances');
    expect(pendingFinance).toBeDefined();
    expect(pendingFinance?.actionHref).toBe('/c/empty-co/finances');

    expect(report.distributions.expenses).toBeNull();
    expect(report.distributions.pipeline).toBeNull();
    expect(report.distributions.audience).toBeNull();
  });

  it('includes content velocity and workflow metrics when available', async () => {
    await fs.mkdir(path.join(tmpDir, 'records/content'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/content/items.yaml'),
      `items:
  - id: item-1
    title: Launch Post
    status: published
  - id: item-2
    title: Draft Article
    status: draft
`,
    );

    await fs.mkdir(path.join(tmpDir, 'records/workflows'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/workflows/processes.yaml'),
      `processes:
  - id: proc-1
    name: Lead Ingestion
    leakPct: 15
  - id: proc-2
    name: Billing Sync
    leakPct: 0
`,
    );

    const report = await computeExecutiveAnalytics(tmpDir, 'content-co', 'Content Co');
    const content = report.liveMetrics.find((m) => m.id === 'content-cadence');
    expect(content).toBeDefined();
    expect(content?.value).toBe(2);
    expect(content?.delta).toBe(1); // 1 published
    expect(content?.formattedValue).toBe('2 items');

    const workflows = report.liveMetrics.find((m) => m.id === 'active-processes');
    expect(workflows).toBeDefined();
    expect(workflows?.value).toBe(2);
    expect(workflows?.delta).toBe(1); // 1 bottleneck
    expect(workflows?.deltaTone).toBe('warn');
    expect(workflows?.formattedValue).toBe('2 tracks');
  });

  it('compares latest snapshot to immediately preceding snapshot and sets deltaTone ok for 0 bottlenecks', async () => {
    await fs.mkdir(path.join(tmpDir, 'records/social'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/social/snapshots.yaml'),
      `snapshots:
  - date: '2026-08-01'
    totalFollowers: 1000
  - date: '2026-08-15'
    totalFollowers: 2000
  - date: '2026-09-01'
    totalFollowers: 2500
`,
    );

    await fs.mkdir(path.join(tmpDir, 'records/workflows'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/workflows/processes.yaml'),
      `processes:
  - id: proc-1
    name: Lead Ingestion
    leakPct: 0
  - id: proc-2
    name: Billing Sync
    leakPct: 0
`,
    );

    const report = await computeExecutiveAnalytics(tmpDir, 'baseline-co', 'Baseline Co');
    const audience = report.liveMetrics.find((m) => m.id === 'audience-reach');
    expect(audience).toBeDefined();
    expect(audience?.value).toBe(2500);
    // (2500 - 2000) / 2000 = 25% (comparing against immediately preceding snapshot, not first snapshot)
    expect(audience?.delta).toBe(25);
    expect(audience?.sparkline).toEqual([1000, 2000, 2500]);

    const workflows = report.liveMetrics.find((m) => m.id === 'active-processes');
    expect(workflows).toBeDefined();
    expect(workflows?.value).toBe(2);
    expect(workflows?.delta).toBe(0);
    expect(workflows?.deltaTone).toBe('ok');
  });
});
