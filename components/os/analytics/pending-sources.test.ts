import { describe, it, expect } from 'vitest';
import { PendingSourcesCard } from './pending-sources';
import type { PendingMetric } from '@/lib/os/analytics/types';

describe('Pending Sources Card', () => {
  it('exports PendingSourcesCard component function', () => {
    expect(typeof PendingSourcesCard).toBe('function');
  });

  it('renders optimal state when no pending sources exist', () => {
    const element = PendingSourcesCard({ pending: [] });
    expect(element).toBeDefined();
  });

  it('renders list of pending sources when items exist', () => {
    const pending: PendingMetric[] = [
      {
        id: 'crm',
        label: 'HubSpot Deals',
        department: 'Growth',
        reason: 'Missing API Key in settings',
        actionLabel: 'Connect',
        actionHref: '/system/connectors',
      },
    ];
    const element = PendingSourcesCard({ pending });
    expect(element).toBeDefined();
  });
});
