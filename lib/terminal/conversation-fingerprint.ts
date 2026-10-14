import { createHash } from "node:crypto"
import { lastConversation } from "./last-conversation"
import type { AiExecutor } from "../ai-executors"
// The cwd-taking variant: a session listing is per-DIRECTORY, so the company
// root has to reach the CLI.
import type { ExecFileFn } from "../company-commands/repo-changes"

/** Strips the colour codes every one of these CLIs writes even when piped. */
function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "")
}

/**
 * The STABLE part of a session listing.
 *
 * Hashing the raw output does not work, and would be expensive to get wrong:
 * Kiro prints a RELATIVE age ("3 seconds ago"), so the same unchanged
 * conversation fingerprints differently on every tick — and since a CHANGED
 * fingerprint is what triggers a run, that is an unattended loop spending the
 * user's credits every minute, forever.
 *
 * So only the parts that move when the CONVERSATION moves are kept: the session
 * ids, and how many messages each holds. A new session or a longer one changes
 * this; the clock alone does not.
 */
export function stableSessionSignature(listing: string): string {
  const text = plain(listing)
  const ids = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []
  const counts = text.match(/\d+\s+msgs?/g) ?? []
  return [...ids, ...counts].join("|")
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}

/**
 * A short string identifying the conversation this company most recently had,
 * or null when it has had none.
 *
 * Null is the load-bearing answer. BOTH resumable executors were measured
 * starting a brand new conversation, and answering it, when asked to resume in
 * a directory with no history — neither fails. So a null here is the only thing
 * standing between "resume the last session" and "invent one".
 *
 * Two sources, because the two CLIs genuinely differ and neither is guessed at:
 * Kiro can be asked (`chat --list-sessions`); Claude has no listing command
 * that works headlessly, so its own transcript store is read instead.
 */
export async function conversationFingerprint(
  executor: AiExecutor,
  rootPath: string,
  execFn: ExecFileFn,
  home?: string
): Promise<string | null> {
  if (!executor.resume) return null

  const listing = executor.resume.listSessions
  if (listing) {
    let stdout: string
    try {
      ;({ stdout } = await execFn(executor.binaryName, listing.args, { cwd: rootPath }))
    } catch {
      // A CLI that cannot answer is not evidence of a conversation. Staying
      // quiet costs a missed note; guessing costs an invented one.
      return null
    }
    if (plain(stdout).includes(listing.emptyOutput)) return null
    const signature = stableSessionSignature(stdout)
    return signature === "" ? null : hash(signature)
  }

  const last = await lastConversation(rootPath, home)
  return last === null ? null : hash(`${last.sessionId}@${last.at}`)
}
