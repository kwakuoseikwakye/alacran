import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { getCompanyCommand } from "../company-commands/registry"
import { takeBeforeSnapshot } from "../company-commands/run-company-command-impl"
import { lockReview } from "../company-commands/review-lock"
import { getCompanyCommandResultImpl } from "../company-commands/company-command-result-impl"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import { listChangedPaths, defaultCwdExecFile, ownedOf, type ExecFileFn } from "../company-commands/repo-changes"
import type { Agent } from "../adapters/types"

export const SESSION_NOTE_COMMAND_ID = "session-note"

export type SaveSessionNoteResult = { ok: true; message: string } | { ok: false; message: string }

/** Only what this needs from a live session, so a test never builds a pty. */
export type WritableSession = { kind: string; write: (data: string) => void }

/**
 * Ask the assistant already talking to the user to write down what this session
 * was, and put the result in front of the user as a diff to approve.
 *
 * **Why the prompt is typed into the live agent rather than handed to a fresh
 * one.** The agent in this pty has the whole conversation in its own context —
 * what was tried, what was rejected, what the user actually meant. The
 * alternative was to scrape `session.backlog` (the app really does keep 200KB
 * of it) and feed that to a headless `claude -p`. That is strictly worse
 * information at strictly higher cost: the backlog is ANSI-laden, truncated at
 * the front, holds redrawn TUI frames rather than a transcript, and would need
 * an untrusted fence around it because a second agent reading a first agent's
 * output is exactly the injection shape the fence exists for. Asking the agent
 * that was there costs one turn and no new security surface.
 *
 * **Why this is not `runCompanyCommandImpl`.** That function's contract is
 * "spawn a scoped agent," and every part of it — the run lock, the tool
 * allowlist, `prepareExecutorScope`, the prefetch — is about a process this app
 * starts. Here the process already exists and this app did not scope it (v61:
 * Open in Terminal and Get Started deliberately have no allowlist). Reusing the
 * runner would have meant threading "don't actually spawn anything" through all
 * of it.
 *
 * **What it DOES reuse, which is the part that matters:** the approval half.
 * Writing `<commandId>.run.json` with a `before` snapshot is the entire contract
 * `getCompanyCommandResultImpl`, `listPendingReviews`, the sidebar dot and
 * `commitCompanyCommandResultImpl` run on — none of them care who wrote the
 * file, only that a record says what to diff against. So the note lands in the
 * same review queue as a scheduled digest, gets read as a diff, and becomes a
 * commit only when the user says so. Never auto-committed: there is no schedule
 * path to this function, and `isSchedulableCommand` refuses the command anyway.
 */
export async function saveSessionNoteImpl(
  agent: Agent,
  session: WritableSession | undefined,
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<SaveSessionNoteResult> {
  const command = getCompanyCommand(SESSION_NOTE_COMMAND_ID)
  // Unreachable while the registry entry exists; a real check anyway, because
  // the alternative to a sentence here is a 500 from a destructured undefined.
  if (!command) return { ok: false, message: "Saving notes isn't available in this version." }

  if (agent.kind !== "command-set") {
    return { ok: false, message: "This folder isn't set up as a company, so there's nowhere to save notes to." }
  }
  if (!session) {
    return { ok: false, message: "That session isn't running any more, so there's nothing to write down." }
  }
  // A plain login shell has no agent in it to ask — the prompt would land on a
  // `$` and be run as a command line. The tab kind is the only thing that
  // distinguishes them, and it is set by the server at open time, not by the
  // client.
  if (session.kind !== "ai") {
    return { ok: false, message: "Switch to the assistant tab first — a command line has no assistant to ask." }
  }

  const prepared = await prepareSessionNote(agent, dataRoot, today)
  if (!prepared.ok) return prepared

  // Written last, so a failure above never leaves the user watching an agent
  // write a note this app has no `before` to diff. The trailing newline is the
  // Enter that submits it.
  session.write(`${prepared.prompt}\n`)

  return { ok: true, message: "Asked the assistant to write it up — the note will appear for you to approve." }
}

export type PreparedSessionNote = { ok: true; prompt: string } | { ok: false; message: string }

/**
 * Added only when a note from a previous session is still unapproved.
 *
 * The command's own prompt asks for `<today>-<a-few-word-slug>.md`, and two
 * sessions on one day can reasonably pick the same few words — which, now that
 * a second note is allowed to land beside an unapproved first, is the one way
 * this could destroy something the user has not read yet.
 */
const PENDING_NOTE_SUFFIX =
  "\n\nA note from an earlier session is still here waiting to be approved. Do not overwrite or edit any " +
  "existing file in that folder — if the name you would use is taken, add a word to yours so both survive."

/**
 * Everything a session note needs BEFORE anyone is asked to write one: the
 * command, the company check, the refusal when an unread note is already
 * waiting, and the `before` snapshot that puts the result in the approval
 * queue.
 *
 * Extracted because there are two ways to ask now — typed into the live agent
 * (above) and resumed headlessly (auto-session-note.ts) — and every check here
 * applies to both. The only thing that differs is who receives the prompt, so
 * that is the only thing left at each call site.
 */
export async function prepareSessionNote(
  agent: Agent,
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR,
  today: string = new Date().toISOString().slice(0, 10),
  mode: "live" | "unattended" = "live",
  execFn: ExecFileFn = defaultCwdExecFile,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<PreparedSessionNote> {
  const command = getCompanyCommand(SESSION_NOTE_COMMAND_ID)
  if (!command) return { ok: false, message: "Saving notes isn't available in this version." }
  if (agent.kind !== "command-set") {
    return { ok: false, message: "This folder isn't set up as a company, so there's nowhere to save notes to." }
  }

  const dataDir = path.join(dataRoot, agent.id)

  /**
   * An unapproved note is a reason to KEEP the existing baseline, not to
   * refuse — and getting that backwards froze this whole feature.
   *
   * **What it used to do, and what that cost.** It refused, correctly
   * reasoning that re-snapshotting `before` now would fold the unreviewed note
   * into the new baseline and drop it out of the approval queue while it still
   * sat on disk. True, but the conclusion was wrong: the refusal sits BEFORE
   * `setNotedFingerprint` in `catchUpSessionNotes`, so the 60-second tick
   * retried and refused forever, and its message was discarded by a caller
   * that keeps only `started`. Measured on a real machine: one unapproved note
   * per company on 2026-08-30 stopped every company from remembering anything
   * for three days, with nothing anywhere saying so.
   *
   * Keeping the old snapshot loses nothing, because it is already the right
   * answer. `before` means "the folder before the notes nobody has approved",
   * and that is the SAME instant whether one note or three have landed since —
   * re-snapshotting is the only operation that could lose information. The
   * pending diff simply grows, and one approval commits all of it.
   *
   * So this path deliberately does not touch the run record: no new
   * `takeBeforeSnapshot`, no rewrite. The one hazard it opens is two notes on
   * the same day choosing the same `<slug>`, which would overwrite a note the
   * user has not read — so the prompt gains a line about it, only in the case
   * that can hit it.
   */
  const existing = await getCompanyCommandResultImpl(command.id, dataDir, agent.rootPath, execFn)
  if (existing.changed) {
    if (mode === "live") {
      // The one exception to "do not touch the record": the live agent is being asked NOW, so lane
      // edits are attributed from now (v234 C1). `before` and `beforeDirty` are carried over as
      // parsed, never re-snapshotted. Files the earlier live prompt already owns stay owned, so a
      // second note never orphans the first one's fact changes.
      // A failure here leaves the record as it was (the earlier live prompt's window, or lanes off).
      const recordPath = path.join(dataDir, `${command.id}.run.json`)
      // Under the review lock, and read under it: Approve deletes the record, and an unlocked
      // read-then-write here could write it back (v238). Another run may hold the lock for a moment, so
      // wait briefly; if it never frees, refuse rather than hand the agent a prompt whose baseline is
      // wrong (its fact edit would read as a stray, or an older baseline would count the owner's own
      // edits as the agent's). Only this owner-started path refuses; the unattended one never gets here.
      let release: (() => Promise<void>) | null = null
      for (let i = 0; i < 10 && !(release = await lockReview(dataDir, command.id).catch(() => null)); i++) await sleep(100)
      if (!release) return { ok: false, message: "Your company is finishing other work. Save what we learned again in a minute." }
      await readFile(recordPath, "utf-8").then(async (raw) => {
        const record = JSON.parse(raw)
        const now = await listChangedPaths(agent.rootPath, execFn).catch(() => null)
        const stillOwned = new Set(now ? ownedOf(record, command, now, () => false) : [])
        const ownedBaseline = now ? now.filter((p) => !stillOwned.has(p)) : null
        await writeFile(recordPath, JSON.stringify({ ...record, ownedBaseline }), "utf-8")
      }).catch(() => {}).finally(() => release!().catch(() => {}))
    }
    return { ok: true, prompt: command.buildPrompt({ mode }, today, "") + PENDING_NOTE_SUFFIX }
  }

  await mkdir(dataDir, { recursive: true })
  const before = await takeBeforeSnapshot(agent.rootPath, command)
  // Same baseline the headless runner records, and it matters MORE here: this
  // prompt goes to a fully interactive session that never had a tool
  // allowlist at all (v61), so "what else did it touch" is a question only
  // this snapshot can answer. Omitting it would make every session note
  // render "couldn't check", which trains the user to ignore the notice.
  const beforeDirty = await listChangedPaths(agent.rootPath, execFn).catch(() => null)
  await writeFile(
    path.join(dataDir, `${command.id}.run.json`),
    JSON.stringify({
      commandId: command.id,
      outputKind: command.outputKind,
      outputPath: command.outputPath,
      before,
      beforeDirty,
      // Only a live prompt can reach the fact lanes; an unattended note's scope is the note folder,
      // so it never gets an owned baseline and any lane edit it shows is someone else's (a stray).
      ...(mode === "live" ? { ownedBaseline: beforeDirty } : {}),
    }),
    "utf-8"
  )


  return { ok: true, prompt: command.buildPrompt({ mode }, today, "") }
}