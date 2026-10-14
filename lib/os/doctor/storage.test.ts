import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inspectStorageLayers, formatBytes } from './storage';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Storage Layers Inspector', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alacran-storage-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('formats byte sizes accurately', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 10)).toBe('10.0 GB');
    expect(formatBytes(1024 * 1024 * 1024 * 1024 * 5)).toBe('5120.0 GB');
  });

  it('inspects storage layers and detects missing/empty directories gracefully', async () => {
    const report = await inspectStorageLayers(tmpDir);
    expect(report.layers).toHaveLength(4);
    expect(report.totalFiles).toBe(0);
    expect(report.totalBytes).toBe(0);
    expect(report.layers.every((l) => !l.exists || l.status === 'empty')).toBe(true);
  });

  it('detects files, bytes, and details when directories are populated', async () => {
    await fs.mkdir(path.join(tmpDir, 'definitions/ontology'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'definitions/ontology/company.yaml'), 'name: Test Co\n');

    await fs.mkdir(path.join(tmpDir, 'records'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'records/finances.yaml'), 'records: [{ id: "tx-1" }]\n');

    await fs.mkdir(path.join(tmpDir, 'docs/decisions'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'docs/decisions/2026-09-10-test.md'), '# Test\n## Why\nBecause.\n');

    const report = await inspectStorageLayers(tmpDir);
    expect(report.totalFiles).toBe(3);
    expect(report.totalBytes).toBeGreaterThan(0);

    const defLayer = report.layers.find((l) => l.layer === 'definitions')!;
    expect(defLayer.exists).toBe(true);
    expect(defLayer.fileCount).toBe(1);
    expect(defLayer.status).toBe('healthy');

    const recLayer = report.layers.find((l) => l.layer === 'records')!;
    expect(recLayer.exists).toBe(true);
    expect(recLayer.fileCount).toBe(1);
    expect(recLayer.status).toBe('healthy');

    const docsLayer = report.layers.find((l) => l.layer === 'docs')!;
    expect(docsLayer.exists).toBe(true);
    expect(docsLayer.fileCount).toBe(1);
    expect(docsLayer.status).toBe('healthy');
  });
});
