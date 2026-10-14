import { describe, it, expect } from 'vitest';
import { formatPhaseNumber, PhaseCard } from './phase-card';

describe('Phase Card Helpers', () => {
  it('formats phase numbers as two-digit uppercase strings', () => {
    expect(formatPhaseNumber(1)).toBe('PHASE 01');
    expect(formatPhaseNumber(9)).toBe('PHASE 09');
    expect(formatPhaseNumber(12)).toBe('PHASE 12');
  });

  it('exports PhaseCard component', () => {
    expect(typeof PhaseCard).toBe('function');
  });
});
