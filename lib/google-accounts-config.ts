import { readFile } from "node:fs/promises"
import path from "node:path"
import { parse } from "yaml"

export const GOOGLE_ACCOUNTS_RELATIVE_PATH = "definitions/integrations/google.yaml"

export type ReadFileFn = (filePath: string) => Promise<string>

const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

/**
 * An account value ends up interpolated straight into a Bash(...) allowlist
 * pattern (see registry.ts's check-inbox bashPatterns, joined with other
 * patterns by a bare comma in lib/ai-executors.ts) and into `gog -a <value>`.
 * A comma or paren in an account value could splice in an extra, unintended
 * allowlist entry; this is the single chokepoint every consumer of accounts
 * routes through, so rejecting anything not shaped like an email closes that
 * off at the source rather than needing every downstream template to escape
 * it. Deliberately excludes gog's own "auto" keyword — that's a fallback
 * this module's callers apply in code, never a value stored in this file.
 */
export function isSafeAccountEmail(value: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)
}

/**
 * The Google accounts (by email) a company has been assigned, in the order
 * they were picked. This is company-owned data — it lives in the company's
 * own repo, same tier as definitions/ontology/company.yaml, not an app
 * preference — so an interactive/manual `/check-inbox` run (v38's Open
 * Terminal) can read the exact same file the dashboard-run path resolves.
 *
 * Missing file, unparseable YAML, or no "accounts" list all resolve to []
 * rather than an error: callers fall back to gog's own "auto" account
 * resolution, so a company that has never touched this feature behaves
 * exactly as it did before this file existed. Entries that aren't shaped
 * like an email (including a hand-edited file, which this SSOT-by-design
 * file deliberately allows) are silently dropped rather than trusted.
 */
export async function readGoogleAccounts(
  agentRootPath: string,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<string[]> {
  let raw: string
  try {
    raw = await readFileFn(path.join(agentRootPath, GOOGLE_ACCOUNTS_RELATIVE_PATH))
  } catch {
    return []
  }

  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch {
    return []
  }

  const list = (parsed as { accounts?: unknown } | null)?.accounts
  return Array.isArray(list)
    ? list.filter((a): a is string => typeof a === "string" && isSafeAccountEmail(a))
    : []
}
