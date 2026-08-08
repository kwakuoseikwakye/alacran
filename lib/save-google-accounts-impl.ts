import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { stringify } from "yaml"
import { getEffectiveAgents } from "./get-effective-agents"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { GOOGLE_ACCOUNTS_RELATIVE_PATH } from "./google-accounts-config"

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
