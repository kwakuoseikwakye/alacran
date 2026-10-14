import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readRoadmap } from './read';
import { clearFileMemo } from '../file-memo';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Roadmap Memoized Reader', () => {
  let tmpDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    clearFileMemo();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alacran-roadmap-test-'));
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty phases and milestones when file is missing', async () => {
    const res = await readRoadmap(tmpDir);
    expect(res).toEqual({ phases: [], milestones: [] });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[readRoadmap] Error reading or parsing'),
      expect.anything(),
    );
  });

  it('returns empty phases and milestones when file content is whitespace/empty', async () => {
    await fs.mkdir(path.join(tmpDir, 'records/roadmap'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'records/roadmap/milestones.yaml'), '   \n  \n');

    const res = await readRoadmap(tmpDir);
    expect(res).toEqual({ phases: [], milestones: [] });
  });

  it('returns empty phases and milestones when YAML schema validation fails', async () => {
    await fs.mkdir(path.join(tmpDir, 'records/roadmap'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/roadmap/milestones.yaml'),
      `
phases:
  - id: p1
    number: -5
    title: Invalid Phase
milestones:
  - id: m1
    quarter: 2026-Q9
`,
    );

    const res = await readRoadmap(tmpDir);
    expect(res).toEqual({ phases: [], milestones: [] });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[readRoadmap] Validation error'),
      expect.any(Array),
    );
  });

  it('reads and parses valid roadmap YAML file', async () => {
    await fs.mkdir(path.join(tmpDir, 'records/roadmap'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'records/roadmap/milestones.yaml'),
      `
phases:
  - id: p1
    number: 1
    title: Core Identity
    status: done
    items:
      - Design tokens
milestones:
  - id: m1
    title: FounderOS Shell
    description: High fidelity shell
    quarter: 2026-Q1
    status: done
`,
    );

    const res = await readRoadmap(tmpDir);
    expect(res.phases).toHaveLength(1);
    expect(res.milestones).toHaveLength(1);
    expect(res.phases[0].title).toBe('Core Identity');
    expect(res.milestones[0].title).toBe('FounderOS Shell');
  });

  it('uses memoized reader caching when mtime is unchanged', async () => {
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 12345 });
    const readFn = vi.fn().mockResolvedValue(`
phases:
  - id: p1
    number: 1
    title: Memo Phase
    status: now
    items: []
milestones: []
`);

    const res1 = await readRoadmap('/mock/dir', readFn, statFn);
    const res2 = await readRoadmap('/mock/dir', readFn, statFn);

    expect(res1.phases).toHaveLength(1);
    expect(res2.phases).toHaveLength(1);
    expect(readFn).toHaveBeenCalledTimes(1);
    expect(statFn).toHaveBeenCalledTimes(2);
  });
});
