import { describe, it, expect } from 'vitest';
import { resolvePerspectiveLabel, RoadmapCanvas } from './roadmap-canvas';

describe('Roadmap Canvas Perspectives', () => {
  it('formats perspective switcher labels correctly', () => {
    expect(resolvePerspectiveLabel('quarters')).toBe('Quarter by Quarter');
    expect(resolvePerspectiveLabel('horizons')).toBe('Agile Horizons');
  });

  it('exports RoadmapCanvas component', () => {
    expect(typeof RoadmapCanvas).toBe('function');
  });
});
