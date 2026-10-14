import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runDoctor, checkRepository, checkConnectors, checkRecords } from './engine';
import * as repositoryCheck from './checks/repository';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

describe('Doctor Engine Orchestrator', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'alacran-engine-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('runs all diagnostic suites and returns report with candid failures on empty root', async () => {
    const report = await runDoctor(tmpDir);
    expect(report.overallScore).toBeLessThan(50);
    expect(report.grade).toBe('Critical');
    expect(report.checks.length).toBeGreaterThanOrEqual(8);
    expect(report.checks.some((c) => c.status === 'fail')).toBe(true);
  });

  it('earns repository points when invariants are satisfied', async () => {
    await fs.writeFile(path.join(tmpDir, '.gitignore'), 'secrets/\n.env\n');
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Working agreement\n');
    await fs.writeFile(path.join(tmpDir, 'HANDOFF.md'), '# Handoff\n');

    await fs.mkdir(path.join(tmpDir, 'definitions/ontology'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'definitions/ontology/company.yaml'),
      'id: test\nname: Test Corp\nmission: Run well\n',
    );

    await fs.mkdir(path.join(tmpDir, 'docs/decisions'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'docs/decisions/2026-09-10-adr.md'),
      '# ADR 1\n## Reasoning\nWe chose this.\n',
    );

    const report = await runDoctor(tmpDir);
    const repoCategory = report.categories.repository;
    expect(repoCategory.score).toBe(40);
    expect(repoCategory.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('detects <<TODO>> placeholders in company ontology and missing reasoning in ADRs', async () => {
    await fs.writeFile(path.join(tmpDir, '.gitignore'), 'secrets/\n.env\n');
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# Working agreement\n');
    await fs.writeFile(path.join(tmpDir, 'HANDOFF.md'), '# Handoff\n');

    await fs.mkdir(path.join(tmpDir, 'definitions/ontology'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'definitions/ontology/company.yaml'),
      'id: test\nmission: <<TODO>> Fill in mission\n',
    );

    await fs.mkdir(path.join(tmpDir, 'docs/decisions'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'docs/decisions/2026-09-10-adr.md'),
      '# ADR 1\nJust summary with no reasoning section\n',
    );

    const checks = await checkRepository(tmpDir);
    const ontologyCheck = checks.find((c) => c.id === 'repo-ontology-exists');
    const decisionCheck = checks.find((c) => c.id === 'repo-decisions-reasoning');

    expect(ontologyCheck?.status).toBe('fail');
    expect(ontologyCheck?.message).toContain('contains <<TODO>> placeholders');
    expect(decisionCheck?.status).toBe('fail');
    expect(decisionCheck?.message).toContain('lacks an explicit Why/Reasoning section');
  });

  it('validates department records when formatted correctly and flags invalid items', async () => {
    const recordsDir = path.join(tmpDir, 'records/finance');
    await fs.mkdir(recordsDir, { recursive: true });

    // Valid records file
    await fs.writeFile(
      path.join(recordsDir, 'invoices.yaml'),
      'records:\n  - id: inv-001\n    amount: 100\n  - id: inv-002\n    amount: 250\n',
    );

    let checks = await checkRecords(tmpDir);
    let validCheck = checks.find((c) => c.id === 'data-records-valid');
    expect(validCheck?.status).toBe('pass');
    expect(validCheck?.message).toContain('1 datasets verified (2 total records with valid IDs)');

    // Add an invalid record missing id
    await fs.writeFile(
      path.join(recordsDir, 'bad.yaml'),
      'records:\n  - description: Missing ID\n',
    );

    checks = await checkRecords(tmpDir);
    validCheck = checks.find((c) => c.id === 'data-records-valid');
    expect(validCheck?.status).toBe('fail');
    expect(validCheck?.message).toContain("missing required 'id' attribute");

    // Add an invalid record with empty/whitespace id
    await fs.writeFile(
      path.join(recordsDir, 'bad.yaml'),
      'records:\n  - id: "   "\n    amount: 50\n',
    );

    checks = await checkRecords(tmpDir);
    validCheck = checks.find((c) => c.id === 'data-records-valid');
    expect(validCheck?.status).toBe('fail');
    expect(validCheck?.message).toContain("missing required 'id' attribute");

    // Root is a YAML array instead of mapping
    await fs.writeFile(
      path.join(recordsDir, 'bad.yaml'),
      '- id: inv-001\n- id: inv-002\n',
    );

    checks = await checkRecords(tmpDir);
    validCheck = checks.find((c) => c.id === 'data-records-valid');
    expect(validCheck?.status).toBe('fail');
    expect(validCheck?.message).toBe('bad.yaml root must be a mapping');

    // 'records' field is a scalar/string instead of list
    await fs.writeFile(
      path.join(recordsDir, 'bad.yaml'),
      'records: not-a-list\n',
    );

    checks = await checkRecords(tmpDir);
    validCheck = checks.find((c) => c.id === 'data-records-valid');
    expect(validCheck?.status).toBe('fail');
    expect(validCheck?.message).toBe("bad.yaml 'records' field must be a list");
  });

  it('provides remediation for uncommitted git changes', async () => {
    await execAsync('git init', { cwd: tmpDir });
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test\n');

    const dirtyChecks = await checkConnectors(tmpDir);
    const dirtyGitCheck = dirtyChecks.find((c) => c.id === 'tool-git-status');
    expect(dirtyGitCheck?.status).toBe('pass');
    expect(dirtyGitCheck?.message).toBe('Git repository has uncommitted changes');
    expect(dirtyGitCheck?.remediation).toEqual({
      actionLabel: 'Inspect Changes',
      command: 'git status',
    });

    await execAsync('git config user.email "test@example.com"', { cwd: tmpDir });
    await execAsync('git config user.name "Test"', { cwd: tmpDir });
    await execAsync('git add README.md && git commit -m "init"', { cwd: tmpDir });

    const cleanChecks = await checkConnectors(tmpDir);
    const cleanGitCheck = cleanChecks.find((c) => c.id === 'tool-git-status');
    expect(cleanGitCheck?.status).toBe('pass');
    expect(cleanGitCheck?.message).toBe('Git repository clean');
    expect(cleanGitCheck?.remediation).toBeUndefined();
  });

  it('captures rejected check suites and reports fallback failure checks without silent dropping', async () => {
    vi.spyOn(repositoryCheck, 'checkRepository').mockRejectedValueOnce(
      new Error('Disk read failure'),
    );

    const report = await runDoctor(tmpDir);
    const suiteErrorCheck = report.checks.find((c) => c.id === 'repository-suite-error');

    expect(suiteErrorCheck).toBeDefined();
    expect(suiteErrorCheck?.status).toBe('fail');
    expect(suiteErrorCheck?.category).toBe('repository');
    expect(suiteErrorCheck?.earnedPoints).toBe(0);
    expect(suiteErrorCheck?.message).toContain('Check suite failed to run: Disk read failure');
  });

  it('executes connectors check suite and returns expected check IDs', async () => {
    const checks = await checkConnectors(tmpDir);
    expect(checks.length).toBe(4);
    const ids = checks.map((c) => c.id);
    expect(ids).toEqual([
      'tool-git-status',
      'tool-gh-cli',
      'tool-runtimes',
      'tool-credentials-safe',
    ]);
  });
});
