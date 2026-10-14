import { describe, it, expect } from 'vitest';
import { calculateStrokeDashoffset } from './health-meter';

describe('Health Meter Math', () => {
  it('calculates radial stroke dash offsets correctly', () => {
    const circumference = 2 * Math.PI * 45; // ~282.74
    expect(calculateStrokeDashoffset(100, circumference)).toBe(0);
    expect(calculateStrokeDashoffset(0, circumference)).toBeCloseTo(circumference, 1);
    expect(calculateStrokeDashoffset(50, circumference)).toBeCloseTo(circumference / 2, 1);
  });

  it('clamps scores above 100 and below 0', () => {
    const circumference = 2 * Math.PI * 45;
    expect(calculateStrokeDashoffset(150, circumference)).toBe(0);
    expect(calculateStrokeDashoffset(-20, circumference)).toBeCloseTo(circumference, 1);
  });
});
