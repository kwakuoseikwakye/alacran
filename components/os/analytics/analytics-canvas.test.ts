import { tree, kids } from "@/lib/test/element-tree";
import { describe, it, expect } from 'vitest';
import { AnalyticsCanvas } from './analytics-canvas';
import type { ExecutiveAnalyticsReport } from '@/lib/os/analytics/types';

describe('Analytics Canvas', () => {
  const mockReport: ExecutiveAnalyticsReport = {
    companyId: 'test-co',
    companyName: 'Test Company',
    liveMetrics: [
      {
        id: 'mrr',
        label: 'Monthly Recurring Revenue',
        unit: 'usd',
        value: 15000,
        formattedValue: '$15k',
        delta: 12.5,
        deltaPct: true,
        source: 'Finances',
        sparkline: [10000, 12000, 15000],
        href: '/finances',
      },
    ],
    pendingMetrics: [
      {
        id: 'crm',
        label: 'HubSpot Pipeline',
        department: 'Growth',
        reason: 'Missing API Key in settings',
        actionLabel: 'Connect',
        actionHref: '/system/connectors',
      },
    ],
    distributions: {
      expenses: {
        id: 'expenses',
        title: 'Operating Burn',
        subtitle: 'By Cost Center',
        total: 5000,
        formattedTotal: '$5k',
        centerLabel: 'Burn',
        slices: [
          { key: 'infra', label: 'Infra', value: 2500, color: '#3df08c', percentage: 50 },
          { key: 'payroll', label: 'Payroll', value: 2500, color: '#60a5fa', percentage: 50 },
        ],
      },
      pipeline: {
        id: 'pipeline',
        title: 'Deal Flow',
        subtitle: 'By Stage',
        total: 10,
        formattedTotal: '10 deals',
        centerLabel: 'Deals',
        slices: [
          { key: 'closed', label: 'Closed', value: 5, color: '#3df08c', percentage: 50 },
          { key: 'discovery', label: 'Discovery', value: 5, color: '#f59e0b', percentage: 50 },
        ],
      },
      audience: {
        id: 'audience',
        title: 'Audience Reach',
        subtitle: 'By Channel',
        total: 2000,
        formattedTotal: '2.0k',
        centerLabel: 'Subscribers',
        slices: [
          { key: 'x', label: 'X / Twitter', value: 1000, color: '#3df08c', percentage: 50 },
          { key: 'linkedin', label: 'LinkedIn', value: 1000, color: '#a855f7', percentage: 50 },
        ],
      },
    },
    activityVolume: {
      points: [
        { date: '2026-09-01', count: 12 },
        { date: '2026-09-02', count: 18 },
      ],
      total14d: 30,
    },
  };

  it('exports AnalyticsCanvas component function', () => {
    expect(typeof AnalyticsCanvas).toBe('function');
  });

  it('renders full executive report with all sections', () => {
    const element = tree(AnalyticsCanvas({ report: mockReport }));
    expect(element).toBeDefined();
    expect(element.props.className).toContain('space-y-8');
  });

  it('omits live metrics section when liveMetrics is empty', () => {
    const emptyMetricsReport: ExecutiveAnalyticsReport = {
      ...mockReport,
      liveMetrics: [],
    };
    const element = tree(AnalyticsCanvas({ report: emptyMetricsReport }));
    expect(element).toBeDefined();

    const children = kids(element);
    const renderedSections = children.filter(Boolean);
    // Should render distributions section and bottom grid section, but not liveMetrics section
    expect(renderedSections).toHaveLength(2);
  });

  it('omits distribution section when all distributions are null', () => {
    const noDistributionsReport: ExecutiveAnalyticsReport = {
      ...mockReport,
      distributions: {
        expenses: null,
        pipeline: null,
        audience: null,
      },
    };
    const element = tree(AnalyticsCanvas({ report: noDistributionsReport }));
    expect(element).toBeDefined();

    const children = kids(element);
    const renderedSections = children.filter(Boolean);
    // Should render liveMetrics section and bottom grid section, but not distributions section
    expect(renderedSections).toHaveLength(2);
  });

  it('renders distribution section when only partial distributions exist', () => {
    const partialDistributionsReport: ExecutiveAnalyticsReport = {
      ...mockReport,
      distributions: {
        expenses: mockReport.distributions.expenses,
        pipeline: null,
        audience: null,
      },
    };
    const element = tree(AnalyticsCanvas({ report: partialDistributionsReport }));
    expect(element).toBeDefined();

    const children = kids(element);
    const renderedSections = children.filter(Boolean);
    // All 3 sections exist: live metrics, distributions, bottom grid
    expect(renderedSections).toHaveLength(3);
  });

  it('renders section landmarks with accessible aria-labels', () => {
    const element = tree(AnalyticsCanvas({ report: mockReport }));
    const children = kids(element);
    const sections = children.filter(Boolean);

    expect(sections[0].props['aria-label']).toBe('Executive Performance Indicators');
    expect(sections[1].props['aria-label']).toBe('Cross-Department Distributions');
    expect(sections[2].props['aria-label']).toBe('Execution Volume and Inactive Records');
  });

  it('correctly pluralizes active indicator count', () => {
    // Single indicator
    const singleReport: ExecutiveAnalyticsReport = {
      ...mockReport,
      liveMetrics: [mockReport.liveMetrics[0]],
    };
    const singleElement = tree(AnalyticsCanvas({ report: singleReport }));
    const singleSections = kids(singleElement).filter(Boolean);
    const singleHeader = singleSections[0].props.children[0];
    const singleSpan = singleHeader.props.children;
    expect(singleSpan.props.children).toEqual([
      'Executive Performance · ',
      1,
      ' ',
      'active indicator',
    ]);

    // Multiple indicators
    const multiReport: ExecutiveAnalyticsReport = {
      ...mockReport,
      liveMetrics: [
        mockReport.liveMetrics[0],
        { ...mockReport.liveMetrics[0], id: 'second-kpi', label: 'Second KPI' },
      ],
    };
    const multiElement = tree(AnalyticsCanvas({ report: multiReport }));
    const multiSections = kids(multiElement).filter(Boolean);
    const multiHeader = multiSections[0].props.children[0];
    const multiSpan = multiHeader.props.children;
    expect(multiSpan.props.children).toEqual([
      'Executive Performance · ',
      2,
      ' ',
      'active indicators',
    ]);
  });
});
