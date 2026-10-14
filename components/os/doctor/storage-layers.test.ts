import { describe, it, expect } from 'vitest';
import { formatLayerStateDot } from './storage-layers';

describe('Storage Layers UI Helpers', () => {
  it('maps layer status to terminal dot state classes', () => {
    expect(formatLayerStateDot('healthy')).toBe('text-os-ok bg-os-ok/20');
    expect(formatLayerStateDot('warning')).toBe('text-os-warn bg-os-warn/20');
    expect(formatLayerStateDot('empty')).toBe('text-os-dim bg-os-border');
  });
});
