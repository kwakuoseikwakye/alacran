import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { stringify } from "yaml"
import { getEffectiveAgents } from "./get-effective-agents"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { COMPANY_INBOX_RELATIVE_PATH, isInboxSlot } from "./company-inbox"

/**
 * Points a company at one of the machine's inboxes. Mirrors
 * saveGoogleAccountsImpl exactly — same tier of company-owned data, same
 * write-then-commit, same "a failed commit is not a failed save".
 *
 * Committing is right here and wrong for save-company-credential-impl.ts,
 * and the difference is the whole point: this file holds a SLOT NUMBER, not
 * a secret. Nothing in it is worth keeping out of a backup.
 */
export async function saveCompanyInboxImpl(
  agentId: string,
  slot: number | null,
  execFn?: ExecFileFn
): Promise<{ ok: true } | { ok: false; message: string }> {
  // Public Server Action surface: the picker only ever offers real slots, but
  // an arbitrary number written here would end up in an INBOX_<n>_USER lookup.
  if (slot !== null && !isInboxSlot(slot)) {
    return { ok: false, message: "That isn't one of this machine's inboxes." }
  }
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }

  const targetPath = path.join(agent.rootPath, COMPANY_INBOX_RELATIVE_PATH)
  try {
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, stringify({ inbox: slot }), "utf-8")
  } catch (err) {
    // A bare "use server" wrapper turns any throw into Next's redacted
    // production digest (see AGENTS.md) — return the real reason instead.
    return { ok: false, message: err instanceof Error ? err.message : "Failed to save" }
  }
  try {
    await commitFile(
      agent.rootPath,
      COMPANY_INBOX_RELATIVE_PATH,
      "Set this company's inbox via AI-Native control panel",
      execFn
    )
  } catch {
    // Deliberately ignored: the file on disk is already correct, which is
    // what every reader in this app uses. Same rule as saveGoogleAccountsImpl.
  }
  return { ok: true }
}
