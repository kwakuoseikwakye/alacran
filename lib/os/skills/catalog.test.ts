import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { parseSkillFrontmatter, inferSkillCategory, readSkillsCatalog } from './catalog';

describe('Skills Catalog Engine', () => {
  it('parses frontmatter correctly with scalar and multiline descriptions', () => {
    const md = `---
name: verify-deploy
description: Runs verification and checks health
category: Engineering
status: live
---
# Instructions
Run the command`;

    const parsed = parseSkillFrontmatter(md);
    expect(parsed.name).toBe('verify-deploy');
    expect(parsed.description).toBe('Runs verification and checks health');
    expect(parsed.category).toBe('Engineering');
    expect(parsed.status).toBe('live');

    const multilineMd = `---
name: multiline-skill
description: >
  This is a multiline description
  that wraps across several lines.
category: Operations
status: learning
---
Body`;
    const parsedMulti = parseSkillFrontmatter(multilineMd);
    expect(parsedMulti.name).toBe('multiline-skill');
    expect(parsedMulti.description).toBe('This is a multiline description that wraps across several lines.');
    expect(parsedMulti.category).toBe('Operations');
    expect(parsedMulti.status).toBe('learning');
  });

  it('infers categories accurately based on naming heuristics', () => {
    expect(inferSkillCategory('run-tests', 'tests/SKILL.md')).toBe('Engineering');
    expect(inferSkillCategory('lead-scoring', 'sales/SKILL.md')).toBe('Sales');
    expect(inferSkillCategory('blog-writer', 'content/SKILL.md')).toBe('Content');
    expect(inferSkillCategory('sync-crm', 'ops/SKILL.md')).toBe('Operations');
    expect(inferSkillCategory('verify', '.claude/commands/verify.md')).toBe('Commands');
    expect(inferSkillCategory('random-tool', 'custom/SKILL.md', 'CustomCat')).toBe('CustomCat');
  });

  it('scans company skills, commands, and global skills with correct editability', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alacran-skills-test-'));
    const companySkillsDir = path.join(tempDir, '.claude', 'skills', 'code-review');
    const companyCommandsDir = path.join(tempDir, '.claude', 'commands');
    fs.mkdirSync(companySkillsDir, { recursive: true });
    fs.mkdirSync(companyCommandsDir, { recursive: true });

    fs.writeFileSync(
      path.join(companySkillsDir, 'SKILL.md'),
      '---\nname: Code Review\ndescription: Automated PR review\n---\nBody',
    );
    fs.writeFileSync(
      path.join(companyCommandsDir, 'digest.md'),
      '---\nname: Daily Digest\ndescription: Generate morning brief\n---\nPrompt',
    );

    const globalSkillsDir = path.join(tempDir, 'global-skills', 'tavily');
    fs.mkdirSync(globalSkillsDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalSkillsDir, 'SKILL.md'),
      '---\nname: Tavily Search\ndescription: Web search tool\n---\nGlobal body',
    );

    const catalog = await readSkillsCatalog(tempDir, 'Test Co', {
      skillsDir: path.join(tempDir, 'global-skills'),
    });

    expect(catalog.length).toBe(3);

    const reviewSkill = catalog.find((s) => s.id === 'code-review');
    expect(reviewSkill).toBeDefined();
    expect(reviewSkill?.isEditable).toBe(true);
    expect(reviewSkill?.provenance).toBe('company');
    expect(reviewSkill?.provenanceLabel).toBe('Test Co');

    const digestCmd = catalog.find((s) => s.id === 'digest');
    expect(digestCmd).toBeDefined();
    expect(digestCmd?.isEditable).toBe(true);
    expect(digestCmd?.provenance).toBe('command');

    const globalSkill = catalog.find((s) => s.id === 'tavily');
    expect(globalSkill).toBeDefined();
    expect(globalSkill?.isEditable).toBe(false);
    expect(globalSkill?.provenance).toBe('global');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('handles frontmatter edge cases gracefully', () => {
    expect(parseSkillFrontmatter('')).toEqual({});
    expect(parseSkillFrontmatter('No frontmatter here')).toEqual({});

    const quotedMd = `---
name: "Quoted Name"
description: 'Single Quoted Description'
category: "Sales"
status: invalid-status
---
content`;
    const parsed = parseSkillFrontmatter(quotedMd);
    expect(parsed.name).toBe('Quoted Name');
    expect(parsed.description).toBe('Single Quoted Description');
    expect(parsed.category).toBe('Sales');
    expect(parsed.status).toBeUndefined();
  });

  it('deduplicates skills prioritizing company over global and sorts by CATEGORY_ORDER', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alacran-skills-test-'));
    const companySkillsDir = path.join(tempDir, '.claude', 'skills');
    const globalSkillsDir = path.join(tempDir, 'global-skills');

    // Create company skill "search"
    fs.mkdirSync(path.join(companySkillsDir, 'search'), { recursive: true });
    fs.writeFileSync(
      path.join(companySkillsDir, 'search', 'SKILL.md'),
      '---\nname: Alpha Company Search\ncategory: Content\n---\nBody',
    );

    // Create company skill "deploy" in Engineering
    fs.mkdirSync(path.join(companySkillsDir, 'deploy'), { recursive: true });
    fs.writeFileSync(
      path.join(companySkillsDir, 'deploy', 'SKILL.md'),
      '---\nname: Deploy App\ncategory: Engineering\n---\nBody',
    );

    // Create global skill with duplicate id "search" and new skill "zebra"
    fs.mkdirSync(path.join(globalSkillsDir, 'search'), { recursive: true });
    fs.writeFileSync(
      path.join(globalSkillsDir, 'search', 'SKILL.md'),
      '---\nname: Global Search\ncategory: Operations\n---\nBody',
    );

    fs.mkdirSync(path.join(globalSkillsDir, 'zebra'), { recursive: true });
    fs.writeFileSync(
      path.join(globalSkillsDir, 'zebra', 'SKILL.md'),
      '---\nname: Zebra Tool\ncategory: Engineering\n---\nBody',
    );

    const catalog = await readSkillsCatalog(tempDir, 'Acme', {
      skillsDir: globalSkillsDir,
    });

    // "search" should not be duplicated, and should be the company one
    const searchSkills = catalog.filter((s) => s.id === 'search');
    expect(searchSkills.length).toBe(1);
    expect(searchSkills[0].provenance).toBe('company');
    expect(searchSkills[0].name).toBe('Alpha Company Search');

    // Engineering skills should come before Content skills
    expect(catalog[0].category).toBe('Engineering');
    expect(catalog[0].name).toBe('Deploy App');
    expect(catalog[1].category).toBe('Engineering');
    expect(catalog[1].name).toBe('Zebra Tool');
    expect(catalog[2].category).toBe('Content');
    expect(catalog[2].name).toBe('Alpha Company Search');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses status case-insensitively (e.g. Live, LEARNING, planned)', () => {
    const liveMd = `---
name: live-skill
status: Live
---`;
    expect(parseSkillFrontmatter(liveMd).status).toBe('live');

    const learningMd = `---
name: learning-skill
status: LEARNING
---`;
    expect(parseSkillFrontmatter(learningMd).status).toBe('learning');

    const plannedMd = `---
name: planned-skill
status: Planned
---`;
    expect(parseSkillFrontmatter(plannedMd).status).toBe('planned');
  });

  it('resiliently continues indexing when an individual skill or command file throws an error', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alacran-skills-resilience-'));
    const companySkillsDir = path.join(tempDir, '.claude', 'skills');
    fs.mkdirSync(path.join(companySkillsDir, 'valid-skill'), { recursive: true });
    fs.mkdirSync(path.join(companySkillsDir, 'error-skill'), { recursive: true });

    fs.writeFileSync(
      path.join(companySkillsDir, 'valid-skill', 'SKILL.md'),
      '---\nname: Valid Skill\nstatus: live\n---\nBody',
    );
    const badSkillFile = path.join(companySkillsDir, 'error-skill', 'SKILL.md');
    fs.writeFileSync(badSkillFile, '---\nname: Bad Skill\n---\nBody');

    const originalReadFileSync = fs.readFileSync;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockRead = vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, options) => {
      if (typeof filePath === 'string' && filePath.includes('error-skill')) {
        throw new Error('EACCES: permission denied');
      }
      return originalReadFileSync(filePath, options);
    });

    try {
      const catalog = await readSkillsCatalog(tempDir, 'Test Co');
      expect(catalog.some((s) => s.id === 'valid-skill')).toBe(true);
      expect(catalog.some((s) => s.id === 'error-skill')).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[readSkillsCatalog] Failed reading company skill in error-skill:'),
        expect.any(Error),
      );
    } finally {
      mockRead.mockRestore();
      warnSpy.mockRestore();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
