import { readFile } from "node:fs/promises"
import path from "node:path"
import { parse } from "yaml"

export const GOOGLE_ACCOUNTS_RELATIVE_PATH = "definitions/integrations/google.yaml"

export type ReadFileFn = (filePath: string) => Promise<string>

const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

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
 * exactly as it did before this file existed.
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
    ? list.filter((a): a is string => typeof a === "string" && a.trim() !== "")
    : []
}
