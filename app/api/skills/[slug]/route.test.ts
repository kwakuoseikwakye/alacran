import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { GET, PUT } from './route';

// Every route handler now refuses a request that is not addressed to this
// machine, and refuses a write that is not same-origin JSON — so a test
// request has to look like one a browser on 127.0.0.1 really sends.
// See lib/http/local-request.ts.
const LOCAL = {
  host: "127.0.0.1:4319",
  origin: "http://127.0.0.1:4319",
  "content-type": "application/json",
}


describe('Skills API Route (/api/skills/[slug])', () => {
  let tempCompanyDir: string;
  let tempGlobalDir: string;
  const originalEnv = process.env.FOUNDER_OS_SKILLS_DIR;

  beforeEach(() => {
    tempCompanyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-skills-test-co-'));
    tempGlobalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-skills-test-global-'));
    process.env.FOUNDER_OS_SKILLS_DIR = tempGlobalDir;
  });

  afterEach(() => {
    process.env.FOUNDER_OS_SKILLS_DIR = originalEnv;
    fs.rmSync(tempCompanyDir, { recursive: true, force: true });
    fs.rmSync(tempGlobalDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('rejects invalid slugs with 400 for GET and PUT', async () => {
    const reqGet = new Request('http://127.0.0.1:4319/api/skills/bad..slug?companyId=test-co', { headers: LOCAL });
    const resGet = await GET(reqGet, { params: Promise.resolve({ slug: 'bad..slug' }) });
    expect(resGet.status).toBe(400);

    const reqPut = new Request('http://127.0.0.1:4319/api/skills/bad..slug', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'test-co', markdown: '# Updated' }),
    });
    const resPut = await PUT(reqPut, { params: Promise.resolve({ slug: 'bad..slug' }) });
    expect(resPut.status).toBe(400);
  });

  it('serves raw markdown for valid skill and respects download query', async () => {
    const skillDir = path.join(tempCompanyDir, '.claude', 'skills', 'deploy');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Deploy Skill\nInstructions here.');

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/deploy?companyId=test-co', { headers: LOCAL });
    const res = await GET(req, { params: Promise.resolve({ slug: 'deploy' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markdown).toContain('# Deploy Skill');
    expect(body.isEditable).toBe(true);
    expect(body.filePath).toContain(path.join('.claude', 'skills', 'deploy', 'SKILL.md'));

    const downloadReq = new Request('http://127.0.0.1:4319/api/skills/deploy?companyId=test-co&download=1', { headers: LOCAL });
    const downloadRes = await GET(downloadReq, { params: Promise.resolve({ slug: 'deploy' }) });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('content-disposition')).toContain('attachment');
    expect(downloadRes.headers.get('content-disposition')).toContain('deploy-SKILL.md');
    const downloadText = await downloadRes.text();
    expect(downloadText).toContain('# Deploy Skill');
  });

  it('serves company command files with isEditable: true', async () => {
    const cmdDir = path.join(tempCompanyDir, '.claude', 'commands');
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(path.join(cmdDir, 'verify.md'), '# Verify Command Prompt');

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/verify?companyId=test-co', { headers: LOCAL });
    const res = await GET(req, { params: Promise.resolve({ slug: 'verify' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markdown).toBe('# Verify Command Prompt');
    expect(body.isEditable).toBe(true);
  });

  it('serves global skills as read-only (isEditable: false)', async () => {
    const globalSkillDir = path.join(tempGlobalDir, 'global-tool');
    fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(path.join(globalSkillDir, 'SKILL.md'), '# Global Tool Skill');

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/global-tool?companyId=test-co', { headers: LOCAL });
    const res = await GET(req, { params: Promise.resolve({ slug: 'global-tool' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.markdown).toBe('# Global Tool Skill');
    expect(body.isEditable).toBe(false);
  });

  it('returns 404 when skill is not found', async () => {
    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/non-existent?companyId=test-co', { headers: LOCAL });
    const res = await GET(req, { params: Promise.resolve({ slug: 'non-existent' }) });
    expect(res.status).toBe(404);
  });

  it('allows PUT to update company-owned skill', async () => {
    const skillDir = path.join(tempCompanyDir, '.claude', 'skills', 'deploy');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Initial Skill');

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/deploy', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'test-co', markdown: '# Updated Skill' }),
    });

    const res = await PUT(req, { params: Promise.resolve({ slug: 'deploy' }) });
    expect(res.status).toBe(200);
    const updated = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(updated).toBe('# Updated Skill');
  });

  it('allows PUT to update company-owned command', async () => {
    const cmdDir = path.join(tempCompanyDir, '.claude', 'commands');
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(path.join(cmdDir, 'verify.md'), '# Initial Command');

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/verify', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'test-co', markdown: '# Updated Command' }),
    });

    const res = await PUT(req, { params: Promise.resolve({ slug: 'verify' }) });
    expect(res.status).toBe(200);
    const updated = fs.readFileSync(path.join(cmdDir, 'verify.md'), 'utf8');
    expect(updated).toBe('# Updated Command');
  });

  it('rejects PUT to global skill with 403 forbidden', async () => {
    const globalSkillDir = path.join(tempGlobalDir, 'global-tool');
    fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(path.join(globalSkillDir, 'SKILL.md'), '# Global Tool Skill');

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/global-tool', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'test-co', markdown: '# Attempt Global Overwrite' }),
    });

    const res = await PUT(req, { params: Promise.resolve({ slug: 'global-tool' }) });
    expect(res.status).toBe(403);
  });

  it('validates PUT body and returns 400 for missing or invalid fields', async () => {
    const reqInvalidJson = new Request('http://127.0.0.1:4319/api/skills/deploy', { headers: LOCAL,
      method: 'PUT',
      body: 'not-json',
    });
    const resInvalidJson = await PUT(reqInvalidJson, { params: Promise.resolve({ slug: 'deploy' }) });
    expect(resInvalidJson.status).toBe(400);

    const reqMissingFields = new Request('http://127.0.0.1:4319/api/skills/deploy', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'test-co' }),
    });
    const resMissingFields = await PUT(reqMissingFields, { params: Promise.resolve({ slug: 'deploy' }) });
    expect(resMissingFields.status).toBe(400);
  });

  it('returns 404 when PUT company is not found', async () => {
    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(null);

    const req = new Request('http://127.0.0.1:4319/api/skills/deploy', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'non-existent', markdown: '# Text' }),
    });

    const res = await PUT(req, { params: Promise.resolve({ slug: 'deploy' }) });
    expect(res.status).toBe(404);
  });

  it('serves correct download filename for command vs skill', async () => {
    const cmdDir = path.join(tempCompanyDir, '.claude', 'commands');
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(path.join(cmdDir, 'daily-brief.md'), '# Daily Brief');

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const downloadCmdReq = new Request('http://127.0.0.1:4319/api/skills/daily-brief?companyId=test-co&download=1', { headers: LOCAL });
    const downloadCmdRes = await GET(downloadCmdReq, { params: Promise.resolve({ slug: 'daily-brief' }) });
    expect(downloadCmdRes.status).toBe(200);
    expect(downloadCmdRes.headers.get('content-disposition')).toBe('attachment; filename="daily-brief.md"');
  });

  it('rejects PUT with 400 when targetFile is a symlink pointing outside companyRoot', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-skills-outside-'));
    const outsideFile = path.join(outsideDir, 'target.md');
    fs.writeFileSync(outsideFile, '# Secret Outside Content');

    const skillDir = path.join(tempCompanyDir, '.claude', 'skills', 'symlink-file');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.symlinkSync(outsideFile, path.join(skillDir, 'SKILL.md'));

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/symlink-file', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'test-co', markdown: '# Malicious Overwrite' }),
    });

    const res = await PUT(req, { params: Promise.resolve({ slug: 'symlink-file' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('forbidden path traversal');

    // Confirm file was not overwritten
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('# Secret Outside Content');
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('rejects PUT with 400 when targetDir is a symlink pointing outside companyRoot', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-skills-outside-dir-'));
    fs.writeFileSync(path.join(outsideDir, 'SKILL.md'), '# Secret In Dir');

    const skillsParentDir = path.join(tempCompanyDir, '.claude', 'skills');
    fs.mkdirSync(skillsParentDir, { recursive: true });
    fs.symlinkSync(outsideDir, path.join(skillsParentDir, 'symlink-dir'));

    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(tempCompanyDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/symlink-dir', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'test-co', markdown: '# Malicious Overwrite' }),
    });

    const res = await PUT(req, { params: Promise.resolve({ slug: 'symlink-dir' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('forbidden path traversal');

    expect(fs.readFileSync(path.join(outsideDir, 'SKILL.md'), 'utf8')).toBe('# Secret In Dir');
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('returns 404 when PUT companyRoot does not exist on disk', async () => {
    const nonExistentDir = path.join(os.tmpdir(), 'does-not-exist-dir-' + Date.now());
    vi.spyOn(await import('@/lib/os/active-company'), 'getActiveCompanyRoot').mockResolvedValue(nonExistentDir);

    const req = new Request('http://127.0.0.1:4319/api/skills/deploy', { headers: LOCAL,
      method: 'PUT',
      body: JSON.stringify({ companyId: 'test-co', markdown: '# Text' }),
    });

    const res = await PUT(req, { params: Promise.resolve({ slug: 'deploy' }) });
    expect(res.status).toBe(404);
  });
});
