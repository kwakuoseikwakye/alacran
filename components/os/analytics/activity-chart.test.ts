import { describe, it, expect, vi } from 'vitest';
import type { DailyVolumePoint } from '@/lib/os/analytics/types';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useId: () => ':r0:',
  };
});

import { ActivityVolumeChart } from './activity-chart';

describe('Activity Volume Chart', () => {
  it('exports ActivityVolumeChart component function', () => {
    expect(typeof ActivityVolumeChart).toBe('function');
  });

  it('renders ActivityVolumeChart with 14-day data points', () => {
    const data: DailyVolumePoint[] = [
      { date: '2026-08-29', count: 12 },
      { date: '2026-08-30', count: 15 },
      { date: '2026-08-31', count: 8 },
      { date: '2026-09-01', count: 20 },
      { date: '2026-09-02', count: 25 },
      { date: '2026-09-03', count: 18 },
      { date: '2026-09-04', count: 30 },
      { date: '2026-09-05', count: 22 },
      { date: '2026-09-06', count: 19 },
      { date: '2026-09-07', count: 28 },
      { date: '2026-09-08', count: 35 },
      { date: '2026-09-09', count: 40 },
      { date: '2026-09-10', count: 32 },
      { date: '2026-09-11', count: 45 },
    ];

    const element = ActivityVolumeChart({ data, total14d: 349 });
    expect(element).toBeDefined();
    expect(element.type).toBeDefined();

    const container = element.props.children;
    const header = container.props.children[0];
    expect(header.props.children[0].props.children).toBe('Operating Execution Volume · 14d');
    expect(header.props.children[1].props.children).toEqual([349, ' total actions']);

    // Check SVG chart
    const chartWrapper = container.props.children[1];
    const svg = chartWrapper.props.children;
    const defs = svg.props.children[0];
    const gradient = defs.props.children;
    expect(gradient.props.id).toBe(':r0:');

    const polygon = svg.props.children[2];
    const polyline = svg.props.children[3];

    expect(polygon.props.fill).toBe('url(#:r0:)');
    expect(polygon.props.points).toBeDefined();
    expect(polygon.props.points).not.toContain('NaN');
    expect(polyline.props.points).toBeDefined();
    expect(polyline.props.points).not.toContain('NaN');

    // Check date labels
    const dateLabels = container.props.children[2];
    const spans = dateLabels.props.children.props?.children ?? dateLabels.props.children;
    expect(spans).toHaveLength(3);
    expect(spans[0].props.children).toBe('aug 29');
    expect(spans[1].props.children).toBe('sep 5');
    expect(spans[2].props.children).toBe('sep 11');
  });

  it('handles empty data points gracefully without crashing', () => {
    const element = ActivityVolumeChart({ data: [], total14d: 0 });
    expect(element).toBeDefined();

    const container = element.props.children;
    const chartWrapper = container.props.children[1];
    const svg = chartWrapper.props.children;
    const polygon = svg.props.children[2];
    const polyline = svg.props.children[3];

    expect(polygon.props.points).toBe('0,170  640,170');
    expect(polyline.props.points).toBe('');
    // Date labels should not render when data is empty
    expect(container.props.children[2]).toBe(false);
  });

  it('handles single data point gracefully without NaN or division by zero', () => {
    const element = ActivityVolumeChart({
      data: [{ date: '2026-09-11', count: 50 }],
      total14d: 50,
    });
    expect(element).toBeDefined();

    const container = element.props.children;
    const chartWrapper = container.props.children[1];
    const svg = chartWrapper.props.children;
    const polygon = svg.props.children[2];
    const polyline = svg.props.children[3];

    expect(polygon.props.points).not.toContain('NaN');
    expect(polyline.props.points).not.toContain('NaN');
    expect(polyline.props.points).toBe('320.0,10.0');

    // Date labels should render single date centered
    const dateLabels = container.props.children[2];
    const singleSpan = dateLabels.props.children;
    expect(singleSpan.props.className).toContain('mx-auto');
    expect(singleSpan.props.children).toBe('sep 11');
  });

  it('handles two data points without duplicating center or end date', () => {
    const element = ActivityVolumeChart({
      data: [
        { date: '2026-09-10', count: 20 },
        { date: '2026-09-11', count: 30 },
      ],
      total14d: 50,
    });
    expect(element).toBeDefined();

    const container = element.props.children;
    const dateLabels = container.props.children[2];
    const spans = dateLabels.props.children.props.children;
    expect(spans).toHaveLength(2);
    expect(spans[0].props.children).toBe('sep 10');
    expect(spans[1].props.children).toBe('sep 11');
  });
});
