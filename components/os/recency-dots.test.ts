import { describe, it, expect } from 'vitest';
import { RecencyDots } from './recency-dots';

describe('RecencyDots Component', () => {
  it('exports RecencyDots component function', () => {
    expect(typeof RecencyDots).toBe('function');
  });

  it('renders container div with descriptive title attribute', () => {
    const element = RecencyDots({ rank: 0, of: 5 });
    expect(element.type).toBe('div');
    expect(element.props.title).toBe('#1 most recent of 5');

    const element3 = RecencyDots({ rank: 2, of: 5 });
    expect(element3.props.title).toBe('#3 most recent of 5');
  });

  it('renders correct number of dot elements', () => {
    const element = RecencyDots({ rank: 1, of: 4 });
    const dots = element.props.children;
    expect(dots).toHaveLength(4);
    dots.forEach((dot: React.ReactElement<{ className?: string }>) => {
      expect(dot.type).toBe('span');
      expect(dot.props.className).toContain('rounded-full');
    });
  });

  it('lights all dots when rank is 0 (most recent)', () => {
    const element = RecencyDots({ rank: 0, of: 5 });
    const dots = element.props.children;
    expect(dots).toHaveLength(5);
    dots.forEach((dot: React.ReactElement<{ style?: { background?: string } }>) => {
      expect(dot.props.style?.background).toBe('var(--os-accent, #3df08c)');
    });
  });

  it('lights partial dots based on rank calculation Math.max(0, of - rank)', () => {
    // rank = 2, of = 5 -> lit = 3
    const element = RecencyDots({ rank: 2, of: 5 });
    const dots = element.props.children;

    // First 3 lit
    expect(dots[0].props.style?.background).toBe('var(--os-accent, #3df08c)');
    expect(dots[1].props.style?.background).toBe('var(--os-accent, #3df08c)');
    expect(dots[2].props.style?.background).toBe('var(--os-accent, #3df08c)');

    // Remaining 2 unlit
    expect(dots[3].props.style?.background).toBe('var(--os-surface2, rgba(255,255,255,0.06))');
    expect(dots[4].props.style?.background).toBe('var(--os-surface2, rgba(255,255,255,0.06))');
  });

  it('leaves all dots unlit when rank equals or exceeds of', () => {
    const element = RecencyDots({ rank: 5, of: 5 });
    const dots = element.props.children;
    dots.forEach((dot: React.ReactElement<{ style?: { background?: string } }>) => {
      expect(dot.props.style?.background).toBe('var(--os-surface2, rgba(255,255,255,0.06))');
    });

    const elementOver = RecencyDots({ rank: 8, of: 5 });
    const dotsOver = elementOver.props.children;
    dotsOver.forEach((dot: React.ReactElement<{ style?: { background?: string } }>) => {
      expect(dot.props.style?.background).toBe('var(--os-surface2, rgba(255,255,255,0.06))');
    });
  });

  it('handles of=0 without error', () => {
    const element = RecencyDots({ rank: 0, of: 0 });
    expect(element.props.children).toHaveLength(0);
  });
});
