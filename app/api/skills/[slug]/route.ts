import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getActiveCompanyRoot } from '@/lib/os/active-company';
import { refuseNonLocal } from '@/lib/http/local-request';

export const dynamic = 'force-dynamic';

const SLUG_RE = /^[a-zA-Z0-9._-]+$/;

function resolveSkillFile(companyRoot: string | null, slug: string): { filePath: string; isEditable: boolean } | null {
  if (companyRoot) {
    // 1. Company skill
    const compSkill = path.join(companyRoot, '.claude', 'skills', slug, 'SKILL.md');
    if (fs.existsSync(compSkill)) return { filePath: compSkill, isEditable: true };

    // 2. Company command
    const compCmd = path.join(companyRoot, '.claude', 'commands', `${slug}.md`);
    if (fs.existsSync(compCmd)) return { filePath: compCmd, isEditable: true };
  }

  // 3. Global skill
  const globalDir = process.env.FOUNDER_OS_SKILLS_DIR ?? path.join(os.homedir(), '.claude', 'skills');
  const globalSkill = path.join(globalDir, slug, 'SKILL.md');
  if (fs.existsSync(globalSkill)) return { filePath: globalSkill, isEditable: false };

  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const refusal = refuseNonLocal(req)
  if (refusal) return refusal

  const { slug } = await params;
  if (!SLUG_RE.test(slug) || slug.includes('..')) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get('companyId');
  const companyRoot = companyId ? await getActiveCompanyRoot(companyId) : null;
  const resolved = resolveSkillFile(companyRoot, slug);

  if (!resolved || !fs.existsSync(resolved.filePath)) {
    return NextResponse.json({ error: 'skill not found' }, { status: 404 });
  }

  const markdown = fs.readFileSync(resolved.filePath, 'utf8');

  if (url.searchParams.get('download') === '1') {
    const isCommand = path.basename(resolved.filePath) === `${slug}.md`;
    const filename = isCommand ? `${slug}.md` : `${slug}-SKILL.md`;
    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({
    markdown,
    filePath: resolved.filePath,
    isEditable: resolved.isEditable,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const refusal = refuseNonLocal(req)
  if (refusal) return refusal

  const { slug } = await params;
  if (!SLUG_RE.test(slug) || slug.includes('..')) {
    return NextResponse.json({ error: 'invalid slug' }, { status: 400 });
  }

  let body: { companyId?: string; markdown?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const { companyId, markdown } = body;
  if (!companyId || typeof markdown !== 'string') {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }

  const companyRoot = await getActiveCompanyRoot(companyId);
  if (!companyRoot || !fs.existsSync(companyRoot)) {
    return NextResponse.json({ error: 'company not found' }, { status: 404 });
  }

  const resolved = resolveSkillFile(companyRoot, slug);
  if (!resolved || !resolved.isEditable) {
    return NextResponse.json({ error: 'forbidden: skill is read-only or not company-owned' }, { status: 403 });
  }

  // Enforce security: strictly within company root
  const realCompanyRoot = fs.realpathSync(companyRoot);
  const targetDir = path.dirname(resolved.filePath);
  const realTargetDir = fs.existsSync(targetDir) ? fs.realpathSync(targetDir) : path.resolve(targetDir);
  const realTargetFile = fs.existsSync(resolved.filePath) ? fs.realpathSync(resolved.filePath) : null;

  const relDir = path.relative(realCompanyRoot, realTargetDir);
  const relFile = realTargetFile ? path.relative(realCompanyRoot, realTargetFile) : null;

  if (relDir.startsWith('..') || path.isAbsolute(relDir) || (relFile && (relFile.startsWith('..') || path.isAbsolute(relFile)))) {
    return NextResponse.json({ error: 'forbidden path traversal' }, { status: 400 });
  }

  fs.writeFileSync(resolved.filePath, markdown, 'utf8');
  return NextResponse.json({ success: true });
}
