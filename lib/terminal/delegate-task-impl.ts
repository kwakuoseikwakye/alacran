import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { getCompanyCommand } from "../company-commands/registry"
import { takeBeforeSnapshot } from "../company-commands/run-company-command-impl"
import { getCompanyCommandResultImpl } from "../company-commands/company-command-result-impl"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import { listChangedPaths, defaultCwdExecFile, type ExecFileFn } from "../company-commands/repo-changes"
import type { Agent } from "../adapters/types"
import type { WritableSession } from "./save-session-note-impl"
import { BANG_REFUSAL, sanitizeTaskText } from "./task-text"

export const DELEGATE_TASK_COMMAND_ID = "delegate-task"
export type DelegateTaskResult = { ok: true; message: string } | { ok: false; message: string }

/** A live session, plus the name its tab shows so the reply can say where the task went. */
export type DelegateSession = WritableSession & { label?: string }

/** Only when an earlier task's summary is still waiting: two tasks on one day can pick the same few words. */
const PENDING_SUFFIX =
  " A summary from an earlier task is still waiting to be approved. Do not overwrite or edit any existing file in notes/company/tasks — " +
  "if the name you would use is taken, add a word to yours so both survive."

/**
 * Type the owner's task into their already-open agent, as if they had typed it, and record what
 * the folder looked like first so the result lands in Approvals.
 *
 * Mirrors `saveSessionNoteImpl`: the text is sanitised AGAIN here (the client's word is never
 * taken), the run record is written BEFORE the keystrokes so a failure never leaves an agent
 * working with nothing to diff against, and a still-unapproved earlier summary keeps the old
 * baseline (re-snapshotting is the only operation that could lose information).
 */
export async function delegateTaskImpl(
  agent: Agent,
  rawTask: unknown,
  session: DelegateSession | undefined,
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR,
  today: string = new Date().toISOString().slice(0, 10),
  execFn: ExecFileFn = defaultCwdExecFile
): Promise<DelegateTaskResult> {
  const command = getCompanyCommand(DELEGATE_TASK_COMMAND_ID)
  if (!command) return { ok: false, message: "Passing tasks to your agent isn't available in this version." }
  if (agent.kind !== "command-set") {
    return { ok: false, message: "This folder isn't set up as a company, so there's no agent to send this to." }
  }
  const task = sanitizeTaskText(rawTask)
  if (!task) return { ok: false, message: "There's nothing to send yet. Type what you want your agent to do." }
  // Checked on the sanitised text, which is what would be typed: a "!" first would run as a command
  // line with no permission prompt, and a trailing ";" lets the appended summary line ride along.
  if (task.startsWith("!")) return { ok: false, message: BANG_REFUSAL }
  if (!session) {
    return { ok: false, message: `Your agent isn't open for ${agent.name}. Open it in Terminal, then send again.` }
  }
  // The tab kind is set by the server at open time, never by the client. A prompt typed at a `$`
  // would run as a command line.
  if (session.kind !== "ai") {
    return { ok: false, message: "That tab is a command line, not your agent. Open your agent first." }
  }

  const dataDir = path.join(dataRoot, agent.id)
  let prompt = command.buildPrompt({ task }, today, "")

  const existing = await getCompanyCommandResultImpl(command.id, dataDir, agent.rootPath, execFn)
  // Two reasons to keep the baseline, and keeping it never loses anything: it already means "the
  // folder before anything the owner has not reviewed", and it frees itself once they commit or
  // revert what is pending. Re-taking it is the only lossy move.
  //  1. A summary is waiting: re-taking would fold it into "before" and drop it from Approvals.
  //  2. An earlier task has edited OTHER files and not written its summary yet: re-taking would
  //     count those edits as already dirty, so they would stop showing as strays and a later,
  //     clean-looking summary could be approved with them unreviewed.
  // Only a KNOWN, non-empty stray list counts for (2). `null` is no record or an unreadable git,
  // and takes a baseline as before (the approval screen already refuses to call an unknown list safe).
  const keepBaseline = existing.changed || (existing.strays !== null && existing.strays.length > 0)
  if (existing.changed) {
    // A summary exists, and today's slug could collide with it.
    prompt += PENDING_SUFFIX
  }
  if (!keepBaseline) {
    await mkdir(dataDir, { recursive: true })
    const before = await takeBeforeSnapshot(agent.rootPath, command)
    const beforeDirty = await listChangedPaths(agent.rootPath, execFn).catch(() => null)
    await writeFile(
      path.join(dataDir, `${command.id}.run.json`),
      JSON.stringify({ commandId: command.id, outputKind: command.outputKind, outputPath: command.outputPath, before, beforeDirty }),
      "utf-8"
    )
  }

  // Written last, as ONE line. The trailing newline is the Enter that submits it, so it must be the
  // only control character: any other newline would submit early (the agent would start the task
  // before being told where to save its summary), and ESC, tab, carriage return or a C1 control
  // would be read by the terminal rather than typed. Same class as `sanitizeTaskText`, which
  // cannot be reused here because it also caps at 4000 and this line is the task plus the rest.
  session.write(`${prompt.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim()}\n`)
  return {
    ok: true,
    message: session.label
      ? `Sent to ${session.label}. Watch it in Terminal. When it saves its summary, that appears in Approvals, with a list of any other files it changed.`
      : "Sent. Watch your agent in Terminal. When it saves its summary, that appears in Approvals, with a list of any other files it changed.",
  }
}
