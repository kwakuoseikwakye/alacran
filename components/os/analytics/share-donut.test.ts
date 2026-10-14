import { describe, it, expect } from 'vitest';
import { ShareDonutCard } from './share-donut';
import type { DistributionChartData } from '@/lib/os/analytics/types';

describe('Share Donut Card', () => {
  it('exports ShareDonutCard component function', () => {
    expect(typeof ShareDonutCard).toBe('function');
  });

  it('renders ShareDonutCard with title, subtitle, center text, and legend', () => {
    const data: DistributionChartData = {
      id: 'expenses',
      title: 'Expense Distribution',
      subtitle: 'Trailing 30d by category',
      total: 12500,
      formattedTotal: '$12.5k',
      centerLabel: 'Total Spend',
      slices: [
        { key: 'payroll', label: 'Payroll', value: 8000, color: '#3df08c', percentage: 64 },
        { key: 'infra', label: 'Infra', value: 3000, color: '#00e5ff', percentage: 24 },
        { key: 'saas', label: 'SaaS', value: 1500, color: '#f59e0b', percentage: 12 },
      ],
    };

    const element = ShareDonutCard({ data });
    expect(element).toBeDefined();
    expect(element.type).toBeDefined();

    // Verify children structure
    const container = element.props.children;
    const header = container.props.children[0];
    expect(header.props.children[0].props.children).toBe('Expense Distribution');
    expect(header.props.children[1].props.children).toBe('Trailing 30d by category');

    // Verify SVG and slices
    const donutWrapper = container.props.children[1];
    const svg = donutWrapper.props.children[0];
    const circleElements = svg.props.children[1];
    expect(circleElements).toHaveLength(3);

    // Verify center text
    const centerText = donutWrapper.props.children[1];
    expect(centerText.props.children[0].props.children).toBe('$12.5k');
    expect(centerText.props.children[1].props.children).toBe('Total Spend');

    // Verify legend
    const legend = container.props.children[2];
    expect(legend.props.children).toHaveLength(3);
  });

  it('renders correctly with empty slices', () => {
    const data: DistributionChartData = {
      id: 'empty',
      title: 'Empty Distribution',
      subtitle: 'No data',
      total: 0,
      formattedTotal: '$0',
      centerLabel: 'No Data',
      slices: [],
    };

    const element = ShareDonutCard({ data });
    expect(element).toBeDefined();
  });
});
