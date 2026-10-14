import { describe, it, expect } from 'vitest';
import { SharePie } from './share-pie';
import type { PieItem } from '@/lib/os/charts/pie-math';

describe('SharePie Component', () => {
  it('exports SharePie component function', () => {
    expect(typeof SharePie).toBe('function');
  });

  it('renders fallback message inside framed card when items array is empty', () => {
    const element = SharePie({
      items: [],
      total: 0,
      centerLabel: 'per month',
      format: (v) => `$${v}`,
      ariaLabel: 'Empty Pie',
    });

    expect(element.type).toBe('div');
    expect(element.props.className).toContain('rounded-lg');
    expect(element.props.className).toContain('border-os-border');
    expect(element.props.className).toContain('bg-os-surface');
    const paragraph = element.props.children;
    expect(paragraph.type).toBe('p');
    expect(paragraph.props.children).toBe('Nothing to chart yet.');
    expect(paragraph.props.className).toContain('text-os-dim');
  });

  it('renders unwrapped fallback message when framed is false and items is empty', () => {
    const element = SharePie({
      items: [],
      total: 0,
      centerLabel: 'per month',
      format: (v) => `$${v}`,
      ariaLabel: 'Empty Pie',
      framed: false,
    });

    expect(element.type).toBe('p');
    expect(element.props.children).toBe('Nothing to chart yet.');
    expect(element.props.className).toContain('text-os-dim');
  });

  it('renders fallback message when all item values are zero or null', () => {
    const items: PieItem[] = [
      { key: 'a', label: 'A', value: 0 },
      { key: 'b', label: 'B', value: null },
    ];
    const element = SharePie({
      items,
      total: 0,
      centerLabel: 'per month',
      format: (v) => `$${v}`,
      ariaLabel: 'Zero Pie',
    });

    expect(element.type).toBe('div');
    const paragraph = element.props.children;
    expect(paragraph.props.children).toBe('Nothing to chart yet.');
  });

  it('renders SVG donut and legend for valid items', () => {
    const items: PieItem[] = [
      { key: 'hosting', label: 'Hosting', value: 400 },
      { key: 'saas', label: 'SaaS Tools', value: 600 },
    ];

    const element = SharePie({
      items,
      total: 1000,
      centerLabel: 'per month',
      format: (v) => `$${v}`,
      ariaLabel: 'Monthly expenses by category',
      donutPx: 160,
    });

    expect(element.type).toBe('div');
    const [svg, legend] = element.props.children;

    // SVG checks
    expect(svg.type).toBe('svg');
    expect(svg.props['aria-label']).toBe('Monthly expenses by category');
    expect(svg.props.role).toBe('img');
    expect(svg.props.style).toEqual({ width: 160, height: 160 });

    const [paths, centerTotal, centerLabel] = svg.props.children;
    expect(paths).toHaveLength(2);
    expect(paths[0].type).toBe('path');
    expect(paths[0].props.d).toBeDefined();
    expect(paths[0].props.stroke).toBeDefined();
    expect(paths[0].props.strokeWidth).toBe(17);
    expect(paths[0].props.children.props.children).toBe('Hosting · $400 · 40.0%');

    expect(centerTotal.props.children).toBe('$1000');
    expect(centerLabel.props.children).toBe('per month');

    // Legend checks
    const legendItems = legend.props.children;
    expect(legendItems).toHaveLength(2);
    expect(legendItems[0].props.children[1].props.children).toBe('Hosting');
    expect(legendItems[0].props.children[2].props.children).toBe('$400');
    expect(legendItems[0].props.children[3].props.children).toBe('40.0%');

    expect(legendItems[1].props.children[1].props.children).toBe('SaaS Tools');
    expect(legendItems[1].props.children[2].props.children).toBe('$600');
    expect(legendItems[1].props.children[3].props.children).toBe('60.0%');
  });

  it('handles micro-slices without applying gap that would invert angles', () => {
    const items: PieItem[] = [
      { key: 'huge', label: 'Huge', value: 9999 },
      { key: 'tiny', label: 'Tiny', value: 1 },
    ];
    const element = SharePie({
      items,
      total: 10000,
      centerLabel: 'total',
      format: (v) => `${v}`,
      ariaLabel: 'Micro Pie',
    });
    expect(element.type).toBe('div');
    const [svg] = element.props.children;
    const [paths] = svg.props.children;
    expect(paths).toHaveLength(2);
    expect(paths[1].props.d).not.toBe('');
  });

  it('applies framed styling with rounded-lg when framed is true (default)', () => {
    const items: PieItem[] = [{ key: 'x', label: 'X', value: 100 }];
    const element = SharePie({
      items,
      total: 100,
      centerLabel: 'total',
      format: (v) => `${v}`,
      ariaLabel: 'Framed Pie',
    });

    expect(element.props.className).toContain('rounded-lg');
    expect(element.props.className).toContain('border-os-border');
    expect(element.props.className).toContain('bg-os-surface');
  });

  it('omits framed styling when framed is false', () => {
    const items: PieItem[] = [{ key: 'x', label: 'X', value: 100 }];
    const element = SharePie({
      items,
      total: 100,
      centerLabel: 'total',
      format: (v) => `${v}`,
      ariaLabel: 'Unframed Pie',
      framed: false,
    });

    expect(element.props.className).not.toContain('border-os-border');
    expect(element.props.className).not.toContain('bg-os-surface');
  });

  it('applies stacked layout classes when stacked is true', () => {
    const items: PieItem[] = [{ key: 'x', label: 'X', value: 100 }];
    const element = SharePie({
      items,
      total: 100,
      centerLabel: 'total',
      format: (v) => `${v}`,
      ariaLabel: 'Stacked Pie',
      stacked: true,
    });

    expect(element.props.className).toContain('flex-col');
  });
});
