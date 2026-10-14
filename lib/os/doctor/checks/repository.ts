import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DiagnosticCheckResult } from '../types';

export async function checkRepository(companyRoot: string): Promise<DiagnosticCheckResult[]> {
  const results: DiagnosticCheckResult[] = [];

  // 1. Secrets ignored in .gitignore
  let secretsIgnored = false;
  try {
    const gitignore = await fs.readFile(path.join(companyRoot, '.gitignore'), 'utf-8');
    secretsIgnored = gitignore.includes('secrets') && gitignore.includes('.env');
  } catch {
    secretsIgnored = false;
  }
  results.push({
    id: 'repo-secrets-ignored',
    title: 'Secrets Exclusion Policy',
    category: 'repository',
    status: secretsIgnored ? 'pass' : 'fail',
    weight: 10,
    earnedPoints: secretsIgnored ? 10 : 0,
    message: secretsIgnored
      ? '.gitignore explicitly blocks secrets/ and .env'
      : '.gitignore must ignore secrets/ and .env to prevent credential leakage',
    remediation: secretsIgnored
      ? undefined
      : {
          actionLabel: 'Update .gitignore',
          command: 'echo -e "\\nsecrets/\\n.env" >> .gitignore',
          fileTarget: '.gitignore',
        },
  });

  // 2. Company ontology exists and no TODOs
  let ontologyValid = false;
  let ontologyMsg = '';
  try {
    const ontologyPath = path.join(companyRoot, 'definitions/ontology/company.yaml');
    const content = await fs.readFile(ontologyPath, 'utf-8');
    if (content.includes('<<TODO')) {
      ontologyValid = false;
      ontologyMsg = 'definitions/ontology/company.yaml contains <<TODO>> placeholders';
    } else {
      ontologyValid = true;
      ontologyMsg = 'Company ontology exists and is filled in';
    }
  } catch {
    ontologyValid = false;
    ontologyMsg = 'definitions/ontology/company.yaml is missing';
  }
  results.push({
    id: 'repo-ontology-exists',
    title: 'Company Ontology Ground Truth',
    category: 'repository',
    status: ontologyValid ? 'pass' : 'fail',
    weight: 10,
    earnedPoints: ontologyValid ? 10 : 0,
    message: ontologyMsg,
    remediation: ontologyValid
      ? undefined
      : {
          actionLabel: 'Define Company',
          slashCommand: '/define-company',
          fileTarget: 'definitions/ontology/company.yaml',
        },
  });

  // 3. Decisions recorded with reasoning
  let decisionsValid = true;
  let decisionCount = 0;
  let decisionMsg = '';
  try {
    const decisionsDir = path.join(companyRoot, 'docs/decisions');
    const entries = await fs.readdir(decisionsDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md') && f !== 'README.md');
    decisionCount = mdFiles.length;

    for (const file of mdFiles) {
      const text = await fs.readFile(path.join(decisionsDir, file), 'utf-8');
      if (!/##+\s*(why|reasoning|rationale)/i.test(text)) {
        decisionsValid = false;
        decisionMsg = `${file} lacks an explicit Why/Reasoning section`;
        break;
      }
    }
    if (decisionsValid) {
      decisionMsg = `${decisionCount} architectural decisions recorded with reasoning`;
    }
  } catch {
    decisionsValid = false;
    decisionMsg = 'No decisions directory in docs/decisions';
  }
  results.push({
    id: 'repo-decisions-reasoning',
    title: 'Architectural Decision Log Rationale',
    category: 'repository',
    status: decisionsValid ? 'pass' : 'fail',
    weight: 10,
    earnedPoints: decisionsValid ? 10 : 0,
    message: decisionMsg,
    remediation: decisionsValid
      ? undefined
      : {
          actionLabel: 'Add Reasoning Section',
          slashCommand: '/decision',
          fileTarget: 'docs/decisions/',
        },
  });

  // 4. Working agreement files exist
  let agreementsExist = false;
  try {
    const agentsStat = await fs.stat(path.join(companyRoot, 'AGENTS.md'));
    const handoffStat = await fs.stat(path.join(companyRoot, 'HANDOFF.md'));
    agreementsExist = agentsStat.size > 0 && handoffStat.size > 0;
  } catch {
    agreementsExist = false;
  }
  results.push({
    id: 'repo-working-agreements',
    title: 'Standing Working Agreements',
    category: 'repository',
    status: agreementsExist ? 'pass' : 'fail',
    weight: 10,
    earnedPoints: agreementsExist ? 10 : 0,
    message: agreementsExist
      ? 'AGENTS.md and HANDOFF.md operational protocols intact'
      : 'AGENTS.md or HANDOFF.md missing from repository root',
    remediation: agreementsExist
      ? undefined
      : {
          actionLabel: 'Initialize Handoff',
          slashCommand: '/handoff',
          fileTarget: 'HANDOFF.md',
        },
  });

  return results;
}
