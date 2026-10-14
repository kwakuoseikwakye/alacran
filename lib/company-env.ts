import { readFile } from "node:fs/promises"
import path from "node:path"

export type ReadFileFn = (filePath: string) => Promise<string>
const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

/**
 * Pulls KEY=value out of .env-shaped text. Deliberately simple (no inline
 * comment stripping, no multi-line values) — the api-connect skill that
 * writes these files always emits a single `KEY=<value>` line.
 */
export function extractEnvVar(envContents: string, key: string): string | null {
  const line = envContents.split("\n").find((l) => l.trim().startsWith(`${key}=`))
  if (!line) return null
  let value = line.trim().slice(key.length + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim()
  }
  return value === "" ? null : value
}

/**
 * Reads one credential from a company's own .env — written by the
 * `api-connect` skill (templates/company-starter/.claude/skills/api-connect),
 * never by this app. This app never issues, stores, or displays these tokens;
 * it only reads them transiently, per request, on the company's own behalf —
 * same trust boundary as any other file already inside that company's repo.
 *
 * One reader for every connector on purpose. NOTION_TOKEN had its own copy of
 * this until TELEGRAM_BOT_TOKEN and SLACK_BOT_TOKEN needed the same six lines
 * (both since replaced by the Beeper CLI, which keeps its own session);
 * two implementations of "read a secret out of the company's .env" is two
 * places for the trust boundary above to drift.
 */
export async function readCompanyEnvVar(
  agentRootPath: string,
  key: string,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<string | null> {
  let raw: string
  try {
    raw = await readFileFn(path.join(agentRootPath, ".env"))
  } catch {
    return null
  }
  return extractEnvVar(raw, key)
}
