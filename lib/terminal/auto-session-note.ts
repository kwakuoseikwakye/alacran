import { spawn as nodeSpawn } from "node:child_process"
import { openSync, closeSync, fstatSync } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { getCompanyCommand } from "../company-commands/registry"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import { resolveAiExecutorForAgent } from "../ai-executor-registry"
import { prepareSessionNote, SESSION_NOTE_COMMAND_ID } from "./save-session-note-impl"
import { conversationFingerprint } from "./conversation-fingerprint"
import { lastConversation } from "./last-conversation"
import { hasLiveAssistant } from "./sessions"
import { getNotedFingerprint, setNotedFingerprint } from "./noted-conversations"
import { prepareExecutorScope } from "../executor-scope"
import { defaultCwdExecFile, type ExecFileFn } from "../company-commands/repo-changes"
import { getSessionNotesForAgent } from "../session-notes-registry"
import { setSessionNoteStatus } from "./session-note-status"
import type { Agent } from "../adapters/types"
import type { AiExecutor } from "../ai-executors"
import { checkMonthlyLimit, readReportedCost, recordRunCost, SESSION_NOTES_JOB, type LimitCheck } from "../jobs/cost"

export type SpawnLike = (
  command: string,
  args: string[],
  options: { cwd: string; detached: boolean; stdio: ["ignore", number, number] }
) => { unref: () => void; on: (event: "error" | "exit", listener: (arg: never) => void) => void }

/**
 * Companies with an auto-note spawn currently in flight.
 *
 * The 60-second ticker has no per-company lock the way a real command run
 * does (runCompanyCommandImpl's acquireRunLock) — this path never had one,
 * because until now it recorded "noted" synchronously right after spawning,
 * which incidentally also blocked the next tick. Recording the fingerprint
 * after the run finishes (see the fix below) reopens that gap: a `--continue`
 * on a long conversation can easily outlive 60 seconds, and without this a
 * second tick would fire a SECOND concurrent resume of the same conversation
 * before the first one's fingerprint even lands. Module-level and in-memory
 * on purpose — the ticker is one setInterval per server process, so there is
 * exactly one of these to guard.
 */
const inFlight = new Set<string>()

/**
 * How long a conversation has to be quiet before it counts as finished.
 *
 * Ten minutes: long enough that reading a long answer, or stepping away
 * mid-thought, is not mistaken for the end of a sitting; short enough that
 * shutting the laptop and coming back after lunch still finds the note
 * written. The cost of being wrong is asymmetric — too short writes up a
 * conversation the user is still having (the bug this exists for), too long
 * delays a note nobody is waiting on.
 */
const IDLE_MS = 10 * 60_000

/**
 * Below this, a conversation is a quick question or two — not worth resuming
 * the whole transcript to write up. ponytail: a byte threshold on the Claude
 * transcript, which carries tool metadata; tune it if real short sessions
 * still get notes, or move to a turn count if an executor exposes one.
 */
export const MIN_NOTE_WORTHY_BYTES = 16_000

/**
 * Write down the conversation this company had, without anyone asking.
 *
 * The gap this closes: a terminal's history lives in Claude Code's own store
 * under `~/.claude`, which is machine-local, vendor-specific and not in git.
 * Reopening the app gave the assistant the company's DESCRIPTION
 * (`docs/company-summary.md` plus the ontology) and none of its HISTORY. The
 * note this writes goes in the company's own repo, versioned, readable by any
 * tool — which is the difference between a convenience and the thing this app
 * is for.
 *
 * **Why resume rather than scrape.** v129 rejected feeding `session.backlog`
 * to a fresh agent: ANSI-laden, front-truncated, redrawn TUI frames rather than
 * a transcript, and a second agent reading a first agent's output is the exact
 * injection shape the untrusted fence exists for. `--continue` hands the job
 * back to the agent that was actually there, with its own context — the same
 * argument v129 made for typing into the live session, now available after
 * that session is gone.
 *
 * **Why the transcript check is not optional.** Measured: `claude --continue -p`
 * in a directory with no history does NOT fail. It silently starts a fresh
 * conversation and answers. Without the fingerprint check this would ask
 * an agent with no session to describe a session, and file the invention as
 * company memory.
 */
export async function writeSessionNoteFromLastConversation(
  agent: Agent,
  spawnFn: SpawnLike = nodeSpawn as unknown as SpawnLike,
  resolveExecutor: (id: string) => Promise<AiExecutor> = resolveAiExecutorForAgent,
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR,
  home?: string,
  execFn: ExecFileFn = defaultCwdExecFile,
  /** Injectable so a test never reads or writes the developer's real .data —
   *  v75's lesson, which this file's own tests hit before it was threaded. */
  notedStorePath?: string,
  /** Injectable so a test never has to stand up a pty registry or a clock. */
  isLive: (agentId: string, executorId: string) => boolean = hasLiveAssistant,
  now: () => number = Date.now,
  /** The company's monthly limit on unattended AI runs (v251). Asked only once a note is really due. */
  checkLimit: (agent: Agent) => Promise<LimitCheck> = (a) => checkMonthlyLimit(a, new Date(now()), dataRoot, " The note is written once the limit lifts.")
): Promise<{ started: boolean; message: string; quiet?: boolean }> {
  // Whichever AI this company is set to run on — not a hardcoded one. An
  // executor with no `resume` simply has no supported way to hand a prompt back
  // to a finished conversation, which is a capability question, not a brand.
  const executor = await resolveExecutor(agent.id)
  if (!executor.resume) {
    return { started: false, message: `${executor.label} can't reopen a past conversation, so there's nothing to ask.` }
  }
  if (inFlight.has(agent.id)) {
    return { started: false, quiet: true, message: "Already writing that up." }
  }

  // **Never write up a conversation that is still happening.** This ticker is
  // named for the LAST conversation, but nothing here ever checked that it was
  // over. `--continue` resumes the most recent transcript in the directory,
  // which during a live sitting is the one the user is typing into — so the
  // note prompt landed in their open session, and because every turn they then
  // took bumped the fingerprint, the next tick saw "new" and did it again, at
  // 60-second cadence, for as long as someone kept using the app.
  //
  // Measured in this repo: ten near-identical notes over 2026-09-18..20 from
  // one unbroken session, the same prompt arriving word-for-word across three
  // calendar dates. v148, v149 and v150 each fixed a way the run echoed
  // ITSELF; none of them asked whether the human was still talking.
  if (isLive(agent.id, executor.id)) {
    return { started: false, quiet: true, message: "Still talking — this gets written up when the tab closes." }
  }

  // Null means "this company has never been talked to". Checked BEFORE
  // anything spawns, because neither CLI refuses to resume a conversation that
  // does not exist — both quietly start a new one and answer it.
  const fingerprint = await conversationFingerprint(executor, agent.rootPath, execFn, home)
  // `quiet` marks the two ORDINARY outcomes — nothing said, or nothing new
  // said. They are what almost every tick returns, so reporting them would
  // rewrite the status file for every company every minute forever and bury
  // the one outcome a user needs to see. Everything else is worth telling
  // them about.
  if (fingerprint === null) return { started: false, quiet: true, message: "Nothing new to write down." }
  if (fingerprint === (await getNotedFingerprint(agent.id, notedStorePath))) {
    return { started: false, quiet: true, message: "That conversation is already written down." }
  }

  // The same question asked of a conversation this app is not hosting: a
  // `claude` started from a real terminal never enters the session registry
  // above, so its liveness has to come from the transcript itself. The test is
  // idle, not merely unchanged — an unchanged fingerprint one second after the
  // last turn means the user is mid-sentence, not finished.
  //
  // ponytail: an absolute turn time, which only the Claude store exposes. An executor
  // whose fingerprint comes from a session LISTING has no absolute clock in it
  // — that is why the fingerprint is a hash and not a timestamp — so it keeps
  // the live-tab guard above and nothing more, leaving one gap: a Kiro run
  // started outside the app. Give that listing an absolute time and this
  // becomes a single rule for both.
  const last = await lastConversation(agent.rootPath, home)
  if (last !== null && now() - last.at < IDLE_MS) {
    return { started: false, quiet: true, message: "Still talking — this gets written up once it goes quiet." }
  }

  if (last !== null && last.size < MIN_NOTE_WORTHY_BYTES) {
    // Recorded as noted, so the next tick doesn't reconsider it; if the
    // conversation carries on, the fingerprint changes and it's looked at again.
    await setNotedFingerprint(agent.id, fingerprint, notedStorePath).catch(() => {})
    return { started: false, quiet: true, message: "Too short to be worth a note." }
  }

  // After the quiet skips, so it is asked only when a note is really due, and before anything is
  // prepared or spawned. Not quiet, so the status shows why; the fingerprint isn't stamped, so the
  // note is written once the limit lifts. ponytail: the status file is rewritten every tick while
  // the limit holds; skip the write when the message is unchanged if that churn ever matters.
  const limit = await checkLimit(agent)
  if (limit.blocked) return { started: false, message: limit.message }

  const command = getCompanyCommand(SESSION_NOTE_COMMAND_ID)
  if (!command) return { started: false, message: "Saving notes isn't available in this version." }

  const prepared = await prepareSessionNote(agent, dataRoot, undefined, "unattended")
  if (!prepared.ok) return { started: false, message: prepared.message }

  const scopeInput = {
    prompt: prepared.prompt,
    editScopePattern: `${command.outputPath}/**`,
    bashPatterns: [] as string[],
  }

  const dataDir = path.join(dataRoot, agent.id)
  await mkdir(dataDir, { recursive: true })
  const logPath = path.join(dataDir, `${command.id}.log`)
  let fd: number | undefined
  try {
    // Before the spawn, and a throw here must abort it. Kiro writes its edit
    // scope to a file rather than argv, and an --agent it cannot find does NOT
    // fail: it prints "Falling back to user specified default" and runs
    // unscoped. Spawning after a failed scope write is how a note-writing run
    // quietly gets the whole repo.
    await prepareExecutorScope(executor.id, scopeInput, agent.rootPath)

    fd = openSync(logPath, "a")
    const logStart = fstatSync(fd).size
    const startedAt = new Date(now()).toISOString()
    inFlight.add(agent.id)
    const resumeArgs = executor.costReport?.resumeArgs(scopeInput, last?.sessionId) ?? executor.resume.buildArgs(scopeInput, last?.sessionId)
    const child = spawnFn(executor.binaryName, [...resumeArgs, ...(executor.routineModelArgs ?? [])], {
      cwd: agent.rootPath,
      detached: true,
      stdio: ["ignore", fd, fd],
    })
    // Fires on both "exit" (the ordinary case) and "error" (missing binary —
    // v56's five-call-site bug: an unlistened 'error' event takes the whole
    // server down). Either way the attempt is over, so the guard lifts.
    const settle = () => {
      inFlight.delete(agent.id)
      // **The fix.** `--continue` appends this run's own turn to the very
      // transcript conversationFingerprint reads, so the fingerprint taken
      // BEFORE spawning is stale the instant the run starts — recording that
      // value would make the next tick see "new" content again forever, an
      // unattended loop re-asking (and re-billing) every 60 seconds for good.
      // Recomputing now, after the run is actually done, records what the
      // conversation looks like AFTER our own turn — so the next tick only
      // fires on a conversation that happened after this one, not on this
      // one's own echo.
      //
      // **v150 circuit-breaker:** if the recomputed fingerprint can't be
      // saved, fall back to saving the PRE-spawn fingerprint. That value is
      // stale — the next tick will see a match and SKIP, which is one missed
      // note-write, not an infinite loop. The alternative (.catch(() => {}))
      // silently swallowed the error and let every subsequent tick re-spawn
      // the same session, re-billing every 60 seconds forever.
      void conversationFingerprint(executor, agent.rootPath, execFn, home)
        .then((fp) => setNotedFingerprint(agent.id, fp ?? fingerprint, notedStorePath))
        .catch(() =>
          setNotedFingerprint(agent.id, fingerprint, notedStorePath).catch(() => {})
        )
    }
    // Best-effort, like the run path's: a cost that can't be recorded never disturbs the note.
    const record = async (code: number | null) => {
      const costUsd = executor.costReport
        ? readReportedCost((await readFile(logPath)).subarray(logStart).toString("utf-8"), code)
        : null
      await recordRunCost(dataDir, { job: SESSION_NOTES_JOB, executorId: executor.id, startedAt, finishedAt: new Date(now()).toISOString(), costUsd })
    }
    child.on("error", settle)
    child.on("exit", (code: never) => {
      settle()
      void record(code as number | null).catch(() => {})
    })
    child.unref()
    return { started: true, message: "Writing up the last session." }
  } catch (err) {
    inFlight.delete(agent.id)
    return { started: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Every company that has said something it hasn't written down.
 *
 * Sequential on purpose, the same reason `runDueSchedulesImpl` is: a machine
 * that was closed for a week wakes with several companies due at once, and
 * firing an agent per company in parallel on a laptop is a worse outcome than
 * finishing a minute later.
 */
export async function catchUpSessionNotes(
  getAgents: () => Promise<Agent[]> = getEffectiveAgents,
  write = writeSessionNoteFromLastConversation,
  isEnabled: (agentId: string) => Promise<boolean> = getSessionNotesForAgent,
  recordStatus = setSessionNoteStatus,
  now: () => string = () => new Date().toISOString()
): Promise<number> {
  let started = 0
  for (const agent of await getAgents()) {
    if (agent.kind !== "command-set") continue
    // Checked BEFORE anything reads a transcript or spawns anything: this is
    // the switch that decides whether the app is allowed to spend money on the
    // user's account unattended, so it has to be the first question asked, not
    // a filter on the result.
    if (!(await isEnabled(agent.id))) continue
    const outcome = await write(agent).catch((err: unknown) => ({
      started: false,
      // A throw here used to become `message: ""` and then get dropped — two
      // ways of losing the same information. It is the user's memory that
      // failed to be written; they get the reason.
      message: err instanceof Error ? err.message : String(err),
    }))
    if (outcome.started) started++
    // Recorded for anything that is not an ordinary quiet skip, success
    // included: "written up at 18:40" is the answer to "does this remember
    // anything", and until now nothing in the app could answer it.
    if (!("quiet" in outcome) || !outcome.quiet) {
      await recordStatus(agent.id, { at: now(), started: outcome.started, message: outcome.message }).catch(() => {})
    }
  }
  return started
}
