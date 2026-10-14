import { describe, it, expect } from 'vitest';
import { tree } from "@/lib/test/element-tree";
import { formatSparklinePoints, MetricCard } from './metric-card';
import type { MetricTile } from '@/lib/os/analytics/types';

describe('Metric Card Component', () => {
  it('formats sparkline data into SVG polyline points string', () => {
    const points = formatSparklinePoints([10, 20, 30], 100, 50);
    expect(points).toBeTruthy();
    expect(points.split(' ')).toHaveLength(3);
    expect(points).toBe('0.0,47.0 50.0,25.0 100.0,3.0');
  });

  it('handles empty sparkline array gracefully', () => {
    expect(formatSparklinePoints([])).toBe('');
  });

  it('handles single value sparkline without NaN or division by zero', () => {
    const points = formatSparklinePoints([100]);
    expect(points).toBe('0.0,23.0');
  });

  it('handles flat values where min equals max', () => {
    const points = formatSparklinePoints([50, 50, 50], 100, 50);
    expect(points).toBe('0.0,47.0 50.0,47.0 100.0,47.0');
  });

  it('exports MetricCard component function', () => {
    expect(typeof MetricCard).toBe('function');
  });

  it('renders MetricCard with delta and link', () => {
    const tile: MetricTile = {
      id: 'mrr',
      label: 'Monthly Recurring Revenue',
      unit: 'usd',
      value: 12500,
      formattedValue: '$12.5k',
      delta: 8.5,
      deltaPct: true,
      source: 'Finances',
      sparkline: [10000, 11000, 12500],
      href: '/c/test/finances',
    };
    const element = tree(MetricCard({ tile }));
    expect(element).toBeDefined();
    expect(element.type).toBeDefined();
  });

  it('renders MetricCard without link or delta', () => {
    const tile: MetricTile = {
      id: 'pipeline',
      label: 'Active Pipeline',
      unit: 'deals',
      value: 15,
      formattedValue: '15 deals',
      source: 'Funnel',
      sparkline: [10, 12, 15],
    };
    const element = tree(MetricCard({ tile }));
    expect(element).toBeDefined();
  });

  it('renders negative delta using Math.abs to avoid double negatives', () => {
    const tile: MetricTile = {
      id: 'burn',
      label: 'Monthly Burn',
      unit: 'usd',
      value: 4500,
      formattedValue: '$4.5k',
      delta: -8.5,
      deltaPct: true,
      source: 'Finances',
      sparkline: [5000, 4800, 4500],
    };
    const element = tree(MetricCard({ tile }));
    expect(element).toBeDefined();

    // Inspect delta element to confirm '▼ ' followed by positive number 8.5
    const topSection = element.props.children[0];
    const headerDiv = topSection.props.children[0];
    const deltaSpan = headerDiv.props.children[1];
    expect(deltaSpan.props.children).toEqual(['▼ ', 8.5, '%']);
  });

  it('only applies hover accent border when tile has href', () => {
    const tileWithHref: MetricTile = {
      id: 'mrr',
      label: 'MRR',
      unit: 'usd',
      value: 1000,
      formattedValue: '$1k',
      source: 'Finances',
      sparkline: [1000],
      href: '/c/test/finances',
    };
    const elementWithHref = tree(MetricCard({ tile: tileWithHref }));
    const innerCard = elementWithHref.props.children;
    expect(innerCard.props.className).toContain('hover:border-os-accent/40');

    const tileWithoutHref: MetricTile = {
      id: 'mrr',
      label: 'MRR',
      unit: 'usd',
      value: 1000,
      formattedValue: '$1k',
      source: 'Finances',
      sparkline: [1000],
    };
    const elementWithoutHref = tree(MetricCard({ tile: tileWithoutHref }));
    expect(elementWithoutHref.props.className).not.toContain('hover:border-os-accent/40');
  });

  it('renders explicit deltaTone with corresponding semantic color token', () => {
    const tileWarn: MetricTile = {
      id: 'bottlenecks',
      label: 'Active Workflows',
      unit: 'processes',
      value: 5,
      formattedValue: '5 tracks',
      delta: 2,
      deltaPct: false,
      deltaTone: 'warn',
      source: 'Workflows',
      sparkline: [5],
    };
    const elementWarn = tree(MetricCard({ tile: tileWarn }));
    const spanWarn = elementWarn.props.children[0].props.children[0].props.children[1];
    expect(spanWarn.props.className).toContain('text-os-warn');
    expect(spanWarn.props.children).toEqual(['▲ +', 2, '']);

    const tileOkZero: MetricTile = {
      id: 'bottlenecks-zero',
      label: 'Active Workflows',
      unit: 'processes',
      value: 5,
      formattedValue: '5 tracks',
      delta: 0,
      deltaPct: false,
      deltaTone: 'ok',
      source: 'Workflows',
      sparkline: [5],
    };
    const elementOkZero = tree(MetricCard({ tile: tileOkZero }));
    const spanOkZero = elementOkZero.props.children[0].props.children[0].props.children[1];
    expect(spanOkZero.props.className).toContain('text-os-ok');
    expect(spanOkZero.props.children).toEqual(['', 0, '']);
  });
});
