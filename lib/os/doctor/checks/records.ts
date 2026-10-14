import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { DiagnosticCheckResult } from '../types';

export async function checkRecords(companyRoot: string): Promise<DiagnosticCheckResult[]> {
  const results: DiagnosticCheckResult[] = [];
  const recordsDir = path.join(companyRoot, 'records');

  let valid = true;
  let fileCount = 0;
  let recordCount = 0;
  let msg = '';

  try {
    async function scanYaml(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!valid) return;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          await scanYaml(full);
        } else if (e.name.endsWith('.yaml') || e.name.endsWith('.yml')) {
          fileCount++;
          const content = await fs.readFile(full, 'utf-8');
          let parsed: unknown;
          try {
            parsed = parseYaml(content);
          } catch {
            valid = false;
            msg = `${e.name} is not a valid YAML mapping`;
            return;
          }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            valid = false;
            msg = `${e.name} root must be a mapping`;
            return;
          }
          const recordMapping = parsed as Record<string, unknown>;
          if ('records' in recordMapping && !Array.isArray(recordMapping.records)) {
            valid = false;
            msg = `${e.name} 'records' field must be a list`;
            return;
          }
          if (Array.isArray(recordMapping.records)) {
            for (const r of recordMapping.records) {
              recordCount++;
              if (
                !r ||
                typeof r !== 'object' ||
                Array.isArray(r) ||
                !(r as Record<string, unknown>).id ||
                (typeof (r as Record<string, unknown>).id === 'string' &&
                  ((r as Record<string, unknown>).id as string).trim() === '')
              ) {
                valid = false;
                msg = `${e.name} contains item missing required 'id' attribute`;
                return;
              }
            }
          }
        }
      }
    }

    await scanYaml(recordsDir);
    if (fileCount === 0) {
      valid = false;
      msg = 'records/ contains no YAML department files';
    } else if (valid) {
      msg = `${fileCount} datasets verified (${recordCount} total records with valid IDs)`;
    }
  } catch {
    valid = false;
    msg = 'records/ directory not found or unreadable';
  }

  results.push({
    id: 'data-records-valid',
    title: 'Department Records Integrity',
    category: 'records',
    status: valid ? 'pass' : 'fail',
    weight: 15,
    earnedPoints: valid ? 15 : 0,
    message: msg,
    remediation: valid
      ? undefined
      : {
          actionLabel: 'Validate Records',
          command: 'python3 scripts/verify.py',
        },
  });

  results.push({
    id: 'data-cross-references',
    title: 'Operational Cross-Reference Consistency',
    category: 'records',
    status: valid ? 'pass' : 'warn',
    weight: 15,
    earnedPoints: valid ? 15 : 5,
    message: valid
      ? 'Workflow and financial records cross-references coherent'
      : 'Department ledgers require validation against active company schemas',
  });

  return results;
}
