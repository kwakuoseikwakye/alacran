import { describe, it, expect } from 'vitest';
import { pieSlices, arcPath, type PieItem } from './pie-math';

describe('pieSlices', () => {
  it('returns empty slices for empty items array', () => {
    expect(pieSlices([])).toEqual([]);
  });

  it('filters out zero, negative, and null values', () => {
    const items: PieItem[] = [
      { key: 'zero', label: 'Zero', value: 0 },
      { key: 'neg', label: 'Negative', value: -10 },
      { key: 'nullVal', label: 'Null Value', value: null },
    ];
    expect(pieSlices(items)).toEqual([]);
  });

  it('filters out non-positive items while keeping positive ones', () => {
    const items: PieItem[] = [
      { key: 'a', label: 'A', value: 100 },
      { key: 'zero', label: 'Zero', value: 0 },
      { key: 'nullVal', label: 'Null', value: null },
      { key: 'neg', label: 'Neg', value: -5 },
    ];
    const slices = pieSlices(items);
    expect(slices).toHaveLength(1);
    expect(slices[0].key).toBe('a');
    expect(slices[0].share).toBe(1);
    expect(slices[0].value).toBe(100);
  });

  it('calculates clockwise angles summing to 360 degrees starting at -90 for two items', () => {
    const items: PieItem[] = [
      { key: 'infra', label: 'Infrastructure', value: 50 },
      { key: 'saas', label: 'SaaS', value: 50 },
    ];
    const slices = pieSlices(items);
    expect(slices).toHaveLength(2);

    expect(slices[0].key).toBe('infra');
    expect(slices[0].share).toBe(0.5);
    expect(slices[0].startAngle).toBe(-90);
    expect(slices[0].endAngle).toBe(90);

    expect(slices[1].key).toBe('saas');
    expect(slices[1].share).toBe(0.5);
    expect(slices[1].startAngle).toBe(90);
    expect(slices[1].endAngle).toBe(270);
  });

  it('calculates correct proportions and angles for unequal distribution', () => {
    const items: PieItem[] = [
      { key: 'payroll', label: 'Payroll', value: 25 },
      { key: 'ops', label: 'Ops', value: 25 },
      { key: 'marketing', label: 'Marketing', value: 50 },
    ];
    const slices = pieSlices(items);
    expect(slices).toHaveLength(3);

    // Total = 100
    expect(slices[0].share).toBe(0.25);
    expect(slices[0].startAngle).toBe(-90);
    expect(slices[0].endAngle).toBe(0);

    expect(slices[1].share).toBe(0.25);
    expect(slices[1].startAngle).toBe(0);
    expect(slices[1].endAngle).toBe(90);

    expect(slices[2].share).toBe(0.5);
    expect(slices[2].startAngle).toBe(90);
    expect(slices[2].endAngle).toBe(270);
  });

  it('handles a single 100% slice spanning 360 degrees', () => {
    const items: PieItem[] = [{ key: 'all', label: 'All', value: 42 }];
    const slices = pieSlices(items);
    expect(slices).toHaveLength(1);
    expect(slices[0].share).toBe(1);
    expect(slices[0].startAngle).toBe(-90);
    expect(slices[0].endAngle).toBe(270);
  });
});

describe('arcPath', () => {
  it('generates a valid SVG arc path string', () => {
    const path = arcPath(84, 84, 62, -90, 90);
    expect(path).toMatch(/^M\s+[\d.]+\s+[\d.]+\s+A\s+62\s+62\s+0\s+[01]\s+1\s+[\d.]+\s+[\d.]+$/);
  });

  it('caps sweep angle to avoid 360 degree degeneracy', () => {
    const path = arcPath(84, 84, 62, -90, 270);
    expect(path).toContain('A 62 62 0 1 1');
  });

  it('returns empty string when a1 <= a0', () => {
    expect(arcPath(84, 84, 62, 90, 90)).toBe('');
    expect(arcPath(84, 84, 62, 90, 80)).toBe('');
  });

  it('handles micro-slices without corruption or NaN', () => {
    const path = arcPath(84, 84, 62, 0, 0.2);
    expect(path).not.toBe('');
    expect(path).not.toContain('NaN');
    expect(path).toMatch(/^M\s+[\d.]+\s+[\d.]+\s+A\s+62\s+62\s+0\s+0\s+1\s+[\d.]+\s+[\d.]+$/);
  });
});
