import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { stringify } from "yaml"
import { getEffectiveAgents } from "./get-effective-agents"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { GOOGLE_ACCOUNTS_RELATIVE_PATH, isSafeAccountEmail } from "./google-accounts-config"

/**
 * Assigns which of this machine's connected Google accounts (gog auth list)
 * a company uses for its inbox commands. Writes and commits
 * definitions/integrations/google.yaml in the company's own repo — mirrors
 * saveCompanyOntologyImpl exactly, same tier of company-owned data.
 */
export async function saveGoogleAccountsImpl(
  agentId: string,
  accounts: string[],
  execFn?: ExecFileFn
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }

  // The picker UI only ever offers real, currently-connected accounts, but
  // this is a public Server Action — reject anything not shaped like an
  // email before it's persisted. Accounts get interpolated straight into a
  // Bash(...) allowlist pattern (registry.ts's check-inbox), so an unsafe
  // value here isn't just bad data, it's a permission-allowlist injection
  // path; readGoogleAccounts filters the same way on read, but refusing at
  // write time gives the caller an actual error instead of a silent drop.
  const badAccount = accounts.find((a) => !isSafeAccountEmail(a))
  if (badAccount !== undefined) {
    return { ok: false, message: `"${badAccount}" doesn't look like an email address` }
  }

  const targetPath = path.join(agent.rootPath, GOOGLE_ACCOUNTS_RELATIVE_PATH)
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, stringify({ accounts }), "utf-8")
  await commitFile(
    agent.rootPath,
    GOOGLE_ACCOUNTS_RELATIVE_PATH,
    "Update connected Google accounts via AI-Native control panel",
    execFn
  )

  return { ok: true }
}
