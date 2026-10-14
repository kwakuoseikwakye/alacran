import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CATEGORY_ORDER, type CatalogSkill, type SkillStatus } from './types';

export { CATEGORY_ORDER };

export function parseSkillFrontmatter(content: string): {
  name?: string;
  description?: string;
  category?: string;
  status?: SkillStatus;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const lines = match[1].split('\n');
  const result: { name?: string; description?: string; category?: string; status?: SkillStatus } = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();

    if (/^[|>][+-]?$/.test(val)) {
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        if (next.trim() === '' || /^\s/.test(next)) block.push(next);
        else break;
      }
      const dedented = block.map((b) => b.trim()).join(' ');
      if (key === 'description') result.description = dedented;
      continue;
    }

    const clean = val.replace(/^["']|["']$/g, '');
    if (key === 'name') result.name = clean;
    if (key === 'description') result.description = clean;
    if (key === 'category') result.category = clean;
    if (key === 'status') {
      const statusClean = clean.toLowerCase();
      if (statusClean === 'live' || statusClean === 'learning' || statusClean === 'planned') {
        result.status = statusClean as SkillStatus;
      }
    }
  }

  return result;
}

export function inferSkillCategory(
  name: string,
  filePath: string,
  declaredCategory?: string,
): string {
  if (declaredCategory) return declaredCategory;
  const lower = `${name} ${filePath}`.toLowerCase();
  if (lower.includes('command') || (filePath.endsWith('.md') && filePath.includes('.claude/commands'))) {
    return 'Commands';
  }
  if (lower.includes('test') || lower.includes('build') || lower.includes('code') || lower.includes('git') || lower.includes('deploy') || lower.includes('dev')) {
    return 'Engineering';
  }
  if (lower.includes('ops') || lower.includes('sync') || lower.includes('task') || lower.includes('work') || lower.includes('doctor')) {
    return 'Operations';
  }
  if (lower.includes('sale') || lower.includes('lead') || lower.includes('deal') || lower.includes('funnel') || lower.includes('crm')) {
    return 'Sales';
  }
  if (lower.includes('content') || lower.includes('blog') || lower.includes('write') || lower.includes('social') || lower.includes('media')) {
    return 'Content';
  }
  return 'General';
}

export async function readSkillsCatalog(
  companyRoot: string,
  companyName: string,
  options?: { skillsDir?: string; packsRoot?: string },
): Promise<CatalogSkill[]> {
  const skills: CatalogSkill[] = [];
  const seenIds = new Set<string>();

  // 0. Shared skills: <companyRoot>/.agents/skills/*/SKILL.md, the copy every agent reads.
  //    The .claude/skills copies below are generated from it, so a name seen here is skipped there.
  const sharedSkillsDir = path.join(companyRoot, '.agents', 'skills');
  if (fs.existsSync(sharedSkillsDir)) {
    try {
      for (const d of fs.readdirSync(sharedSkillsDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const skillFile = path.join(sharedSkillsDir, d.name, 'SKILL.md');
        if (!fs.existsSync(skillFile)) continue;
        const fm = parseSkillFrontmatter(fs.readFileSync(skillFile, 'utf8'));
        seenIds.add(d.name);
        skills.push({
          id: d.name,
          name: fm.name ?? d.name,
          description: fm.description ?? `Skill located in .agents/skills/${d.name}`,
          category: inferSkillCategory(fm.name ?? d.name, skillFile, fm.category),
          provenance: 'company',
          provenanceLabel: companyName,
          filePath: path.join('.agents', 'skills', d.name, 'SKILL.md'),
          isEditable: true,
          status: fm.status ?? 'live',
        });
      }
    } catch (err) {
      console.warn(`[readSkillsCatalog] Failed reading shared skills in ${sharedSkillsDir}:`, err);
    }
  }

  // 1. Company Skills: <companyRoot>/.claude/skills/*/SKILL.md
  const compSkillsDir = path.join(companyRoot, '.claude', 'skills');
  if (fs.existsSync(compSkillsDir)) {
    try {
      const dirs = fs.readdirSync(compSkillsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        if (seenIds.has(d.name)) continue;
        try {
          const skillFile = path.join(compSkillsDir, d.name, 'SKILL.md');
          if (fs.existsSync(skillFile)) {
            const raw = fs.readFileSync(skillFile, 'utf8');
            const fm = parseSkillFrontmatter(raw);
            const id = d.name;
            seenIds.add(id);
            skills.push({
              id,
              name: fm.name ?? d.name,
              description: fm.description ?? `Skill located in .claude/skills/${d.name}`,
              category: inferSkillCategory(fm.name ?? d.name, skillFile, fm.category),
              provenance: 'company',
              provenanceLabel: companyName,
              filePath: path.join('.claude', 'skills', d.name, 'SKILL.md'),
              isEditable: true,
              status: fm.status ?? 'live',
            });
          }
        } catch (err) {
          console.warn(`[readSkillsCatalog] Failed reading company skill in ${d.name}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[readSkillsCatalog] Failed reading company skills in ${compSkillsDir}:`, err);
    }
  }

  // 2. Company Commands: <companyRoot>/.claude/commands/*.md
  const compCmdsDir = path.join(companyRoot, '.claude', 'commands');
  if (fs.existsSync(compCmdsDir)) {
    try {
      const files = fs.readdirSync(compCmdsDir, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue;
        try {
          const cmdFile = path.join(compCmdsDir, f.name);
          const raw = fs.readFileSync(cmdFile, 'utf8');
          const fm = parseSkillFrontmatter(raw);
          const id = f.name.replace(/\.md$/, '');
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          skills.push({
            id,
            name: fm.name ?? `/${id}`,
            description: fm.description ?? `Prompt command /${id}`,
            category: 'Commands',
            provenance: 'command',
            provenanceLabel: `${companyName} · Command`,
            filePath: path.join('.claude', 'commands', f.name),
            isEditable: true,
            status: fm.status ?? 'live',
          });
        } catch (err) {
          console.warn(`[readSkillsCatalog] Failed reading company command in ${f.name}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[readSkillsCatalog] Failed reading company commands in ${compCmdsDir}:`, err);
    }
  }

  // 3. Starter Packs (optional): <options.packsRoot>/*/.agents/skills/*/SKILL.md (or .claude/skills in a pack not yet moved)
  if (options?.packsRoot && fs.existsSync(options.packsRoot)) {
    try {
      const packDirs = fs.readdirSync(options.packsRoot, { withFileTypes: true });
      for (const pd of packDirs) {
        if (!pd.isDirectory()) continue;
        const sharedDir = path.join(options.packsRoot, pd.name, '.agents', 'skills');
        const packSkillsDir = fs.existsSync(sharedDir) ? sharedDir : path.join(options.packsRoot, pd.name, '.claude', 'skills');
        if (!fs.existsSync(packSkillsDir)) continue;
        try {
          const dirs = fs.readdirSync(packSkillsDir, { withFileTypes: true });
          for (const d of dirs) {
            if (!d.isDirectory()) continue;
            try {
              const skillFile = path.join(packSkillsDir, d.name, 'SKILL.md');
              if (fs.existsSync(skillFile)) {
                const id = d.name;
                if (seenIds.has(id)) continue;
                seenIds.add(id);
                const raw = fs.readFileSync(skillFile, 'utf8');
                const fm = parseSkillFrontmatter(raw);
                skills.push({
                  id,
                  name: fm.name ?? d.name,
                  description: fm.description ?? `Starter pack skill from ${pd.name}`,
                  category: inferSkillCategory(fm.name ?? d.name, skillFile, fm.category),
                  provenance: 'pack',
                  provenanceLabel: `Starter Pack (${pd.name})`,
                  filePath: path.join(packSkillsDir, d.name, 'SKILL.md'),
                  isEditable: false,
                  status: fm.status ?? 'live',
                });
              }
            } catch (err) {
              console.warn(`[readSkillsCatalog] Failed reading starter pack skill in ${d.name}:`, err);
            }
          }
        } catch (err) {
          console.warn(`[readSkillsCatalog] Failed reading starter pack skills in ${packSkillsDir}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[readSkillsCatalog] Failed reading starter packs in ${options.packsRoot}:`, err);
    }
  }

  // 4. Global Skills: ~/.claude/skills/*/SKILL.md (or options.skillsDir / env override)
  const globalSkillsDir = options?.skillsDir ?? process.env.FOUNDER_OS_SKILLS_DIR ?? path.join(os.homedir(), '.claude', 'skills');
  if (fs.existsSync(globalSkillsDir)) {
    try {
      const dirs = fs.readdirSync(globalSkillsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        try {
          const skillFile = path.join(globalSkillsDir, d.name, 'SKILL.md');
          if (fs.existsSync(skillFile)) {
            const id = d.name;
            if (seenIds.has(id)) continue;
            seenIds.add(id);
            const raw = fs.readFileSync(skillFile, 'utf8');
            const fm = parseSkillFrontmatter(raw);
            skills.push({
              id,
              name: fm.name ?? d.name,
              description: fm.description ?? `Global Claude skill ~/.claude/skills/${d.name}`,
              category: inferSkillCategory(fm.name ?? d.name, skillFile, fm.category),
              provenance: 'global',
              provenanceLabel: 'Global (~/.claude)',
              filePath: path.join('~', '.claude', 'skills', d.name, 'SKILL.md'),
              isEditable: false,
              status: fm.status ?? 'live',
            });
          }
        } catch (err) {
          console.warn(`[readSkillsCatalog] Failed reading global skill in ${d.name}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[readSkillsCatalog] Failed reading global skills in ${globalSkillsDir}:`, err);
    }
  }

  // Sort by category order then by name
  return skills.sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category);
    const catB = CATEGORY_ORDER.indexOf(b.category);
    const orderA = catA === -1 ? 99 : catA;
    const orderB = catB === -1 ? 99 : catB;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}
