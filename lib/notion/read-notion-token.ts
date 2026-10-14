import { readCompanyEnvVar, type ReadFileFn } from "../company-env"

export type { ReadFileFn } from "../company-env"
/** Re-exported so this module's own tests and callers keep their import path;
 *  the implementation moved to lib/company-env.ts when Telegram and Slack
 *  needed the same reader. */
export { extractEnvVar } from "../company-env"

/** Reads NOTION_TOKEN from a company's own .env. See readCompanyEnvVar for the
 *  trust boundary this sits on. */
export async function readNotionToken(
  agentRootPath: string,
  readFileFn?: ReadFileFn
): Promise<string | null> {
  return readCompanyEnvVar(agentRootPath, "NOTION_TOKEN", readFileFn)
}
