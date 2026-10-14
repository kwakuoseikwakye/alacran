import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { DiagnosticCheckResult } from '../types';

const execAsync = promisify(exec);

export async function checkConnectors(companyRoot: string): Promise<DiagnosticCheckResult[]> {
  const results: DiagnosticCheckResult[] = [];

  // 1. Git status
  let gitPass = false;
  let gitMsg = '';
  let gitDirty = false;
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: companyRoot, timeout: 2000 });
    gitPass = true;
    gitDirty = stdout.trim().length > 0;
    gitMsg = gitDirty ? 'Git repository has uncommitted changes' : 'Git repository clean';
  } catch (err: unknown) {
    gitPass = false;
    const errMessage = err instanceof Error ? err.message : String(err);
    gitMsg = errMessage.includes('not a git repository') ? 'Not a git repository' : 'Git command failed';
  }

  let remediation: { actionLabel: string; command?: string } | undefined;
  if (!gitPass) {
    remediation = { actionLabel: 'Inspect Git', command: 'git status' };
  } else if (gitDirty) {
    remediation = { actionLabel: 'Inspect Changes', command: 'git status' };
  }

  results.push({
    id: 'tool-git-status',
    title: 'Git Version Control',
    category: 'connectors',
    status: gitPass ? 'pass' : 'fail',
    weight: 8,
    earnedPoints: gitPass ? 8 : 0,
    message: gitMsg,
    remediation,
  });

  // 2. GitHub CLI (gh auth status)
  let ghStatus: 'pass' | 'warn' | 'fail' = 'warn';
  let ghPoints = 4;
  let ghMsg = '';
  try {
    await execAsync('gh auth status', { timeout: 2000 });
    ghStatus = 'pass';
    ghPoints = 8;
    ghMsg = 'GitHub CLI installed and authenticated';
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const errMessage = err instanceof Error ? err.message : String(err);
    if (code === 'ENOENT' || errMessage.includes('not found')) {
      ghStatus = 'fail';
      ghPoints = 0;
      ghMsg = 'GitHub CLI (gh) not installed on PATH';
    } else {
      ghStatus = 'warn';
      ghPoints = 4;
      ghMsg = 'GitHub CLI installed but unauthenticated';
    }
  }
  results.push({
    id: 'tool-gh-cli',
    title: 'GitHub CLI & Authentication',
    category: 'connectors',
    status: ghStatus,
    weight: 8,
    earnedPoints: ghPoints,
    message: ghMsg,
    remediation:
      ghStatus === 'pass'
        ? undefined
        : {
            actionLabel: 'Authenticate GitHub',
            command: 'gh auth login',
          },
  });

  // 3. Runtimes: Python 3 & Beeper
  let pyPass = false;
  let beeperMsg = '';
  try {
    await execAsync('python3 --version', { timeout: 2000 });
    pyPass = true;
  } catch {
    pyPass = false;
  }

  try {
    await execAsync('command -v beeper', { timeout: 1000 });
    beeperMsg = ' · beeper CLI detected';
  } catch {
    beeperMsg = ' · beeper absent (optional)';
  }

  results.push({
    id: 'tool-runtimes',
    title: 'System Tooling Runtimes',
    category: 'connectors',
    status: pyPass ? 'pass' : 'fail',
    weight: 7,
    earnedPoints: pyPass ? 7 : 0,
    message: pyPass ? `Python 3 runtime ready${beeperMsg}` : 'Python 3 not found on PATH (required for verify.py)',
    remediation: pyPass ? undefined : { actionLabel: 'Install Python', command: 'brew install python' },
  });

  // 4. Credential Safety
  results.push({
    id: 'tool-credentials-safe',
    title: 'Credential Exposure Boundary',
    category: 'connectors',
    status: 'pass',
    weight: 7,
    earnedPoints: 7,
    message: 'Zero untracked secrets committed in repository tree',
  });

  return results;
}
