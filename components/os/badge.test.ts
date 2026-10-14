import { describe, it, expect } from 'vitest';
import { tree } from "@/lib/test/element-tree";
import { Badge, type BadgeTone } from './badge';

describe('Shared OS Badge', () => {
  it('exports Badge component function', () => {
    expect(typeof Badge).toBe('function');
  });

  it('renders default tone as neutral with font-mono styling', () => {
    const element = tree(Badge({ children: 'Test Badge' }));
    expect(element).toBeDefined();
    expect(element.type).toBe('span');
    expect(element.props.children).toBe('Test Badge');
    expect(element.props.className).toContain('font-mono');
    expect(element.props.className).toContain('bg-os-surface2');
    expect(element.props.className).toContain('text-os-dim');
    expect(element.props.className).toContain('border-os-border');
  });

  it('renders accent tone with accent semantic colors', () => {
    const element = tree(Badge({ children: 'Accent Badge', tone: 'accent' }));
    expect(element.props.className).toContain('bg-os-accent/10');
    expect(element.props.className).toContain('text-os-accent');
    expect(element.props.className).toContain('border-os-accent/20');
  });

  it('renders ok tone with ok semantic colors', () => {
    const element = tree(Badge({ children: 'Ok Badge', tone: 'ok' }));
    expect(element.props.className).toContain('bg-os-ok/10');
    expect(element.props.className).toContain('text-os-ok');
    expect(element.props.className).toContain('border-os-ok/20');
  });

  it('renders warn tone with warn semantic colors', () => {
    const element = tree(Badge({ children: 'Warn Badge', tone: 'warn' }));
    expect(element.props.className).toContain('bg-os-warn/10');
    expect(element.props.className).toContain('text-os-warn');
    expect(element.props.className).toContain('border-os-warn/20');
  });

  it('renders err tone with err semantic colors', () => {
    const element = tree(Badge({ children: 'Err Badge', tone: 'err' }));
    expect(element.props.className).toContain('bg-os-err/10');
    expect(element.props.className).toContain('text-os-err');
    expect(element.props.className).toContain('border-os-err/20');
  });

  it('appends custom className when specified', () => {
    const element = tree(Badge({ children: 'Custom', tone: 'accent', className: 'ml-2 shadow-sm' }));
    expect(element.props.className).toContain('ml-2');
    expect(element.props.className).toContain('shadow-sm');
    expect(element.props.className).toContain('text-os-accent');
  });

  it('falls back safely to neutral tone for unrecognized tones', () => {
    const element = tree(Badge({ children: 'Fallback', tone: 'unknown' as BadgeTone }));
    expect(element.props.className).toContain('bg-os-surface2');
    expect(element.props.className).toContain('text-os-dim');
  });
});
