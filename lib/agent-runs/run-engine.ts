import { appendFileSync, closeSync, openSync, realpathSync, statSync } from "node:fs"
import { mkdir, readFile, rm } from "node:fs/promises"
import { execFile as nodeExecFile, spawn as nodeSpawn } from "node:child_process"
import { promisify } from "node:util"
import { randomUUID } from "node:crypto"
import path from "node:path"
import type { IPty } from "@homebridge/node-pty-prebuilt-multiarch"
import { dataPath } from "../data-dir"
import { getEffectiveAgents } from "../get-effective-agents"
import { resolveAiExecutorForAgent } from "../ai-executor-registry"
import { getAiExecutor, type AiExecutor } from "../ai-executors"
import { defaultExecFile } from "../default-exec-file"
import type { ExecFileFn } from "../git-commit-file"
import { createBacklog } from "../terminal/backlog"
import {
  closeSession,
  countSessions,
  openSession,
  getSession,
  MAX_BACKLOG,
  MAX_SESSIONS_PER_WORKSPACE,
  registerSession,
  type TerminalSession,
} from "../terminal/sessions"
import { formatStreamLine, type FormattedLine } from "./format-stream"
import { createLogTail } from "./log-tail"
import { buildFeedbackPrompt, buildRunPrompt } from "./prompt"
import { TAKEOVER_PREFIX } from "./run-view"
import { listIgnoredFiles, listRunChanges, mergeRunBranch, withRootLock, type RunChange } from "./landing"
import { readRunRecords, writeRunRecord, type RunRecord, type RunStatus } from "./records"
import { commitRunWorktree, createRunWorktree, hasUnsavedChanges, removeRunWorktree, worktreeHasChanges } from "./worktree"

/** Spec §3: an unattended run that goes past this is stopped. */
export const RUN_TIME_LIMIT_MS = 60 * 60 * 1000
const TICK_MS = 250
/** Liveness and the time limit are checked every this many ticks (~2s). */
export const CHECK_EVERY_TICKS = 8
const MAX_TASK_CHARS = 8000

type SpawnedRun = { pid?: number; unref(): void; on(event: "error", listener: (err: Error) => void): void }

export type RunDeps = {
  getAgents: () => Promise<{ id: string; name: string; rootPath: string; kind: string }[]>
  resolveExecutor: (agentId: string) => Promise<AiExecutor>
  exec: ExecFileFn
  spawn: (
    command: string,
    args: string[],
    options: { cwd: string; detached: true; stdio: ["ignore", number, number] }
  ) => SpawnedRun
  isAlive: (pid: number) => boolean
  /** Whether `pid` is still the agent: the right program, started when the
   *  run did (see matchesRunProcess). Guards every reattach and every kill
   *  against the OS having handed the pid to something else. */
  isRunProcess: (pid: number, binaryName: string, startedAt: string) => Promise<boolean>
  kill: (pid: number) => void
  now: () => number
  newId: () => string
  runsDir: (agentId: string) => string
  worktreeDir: (agentId: string, runId: string) => string
  /** Calls `fn` every tick until the returned function is called. `fn`
   *  returns the tick's promise, so a test can await a tick instead of
   *  guessing how long one takes. */
  schedule: (fn: () => unknown) => () => void
}

export const defaultRunDeps: RunDeps = {
  getAgents: getEffectiveAgents,
  resolveExecutor: resolveAiExecutorForAgent,
  exec: defaultExecFile,
  spawn: (command, args, options) => nodeSpawn(command, args, options),
  isAlive: (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "EPERM"
    }
  },
  isRunProcess: async (pid, binaryName, startedAt) => {
    try {
      // LC_ALL=C: `lstart` is spelled in the locale, and Date.parse reads English.
      const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-o", "command=", "-p", String(pid)], {
        env: { ...process.env, LC_ALL: "C" },
      })
      // `lstart` is a fixed 24 characters ("Thu Sep 25 10:00:00 2026"); the command follows.
      const line = stdout.trim()
      return matchesRunProcess(line.slice(24), line.slice(0, 24), binaryName, startedAt)
    } catch {
      return false
    }
  },
  kill: (pid) => {
    // Detached, so it leads its own process group: signal the group, so a
    // helper the CLI started goes with it.
    try {
      process.kill(-pid, "SIGTERM")
    } catch {
      try {
        process.kill(pid, "SIGTERM")
      } catch {
        /* already gone */
      }
    }
  },
  now: Date.now,
  newId: () => randomUUID().replace(/-/g, ""),
  runsDir: (agentId) => dataPath("agent-runs", agentId),
  worktreeDir: (agentId, runId) => dataPath("agent-worktrees", agentId, runId),
  schedule: (fn) => {
    const timer = setInterval(fn, TICK_MS)
    timer.unref?.()
    return () => clearInterval(timer)
  },
}

/** Every name the worktree goes by — see formatStreamLine's `root`. */
function worktreeRoots(worktreePath: string): string[] {
  try {
    const real = realpathSync(worktreePath)
    return real === worktreePath ? [worktreePath] : [worktreePath, real]
  } catch {
    return [worktreePath]
  }
}

const execFileAsync = promisify(nodeExecFile)

/**
 * Whether a process `ps` describes is this run's agent: the right program AND
 * started within seconds of the run. The program alone proves nothing — the
 * user's own interactive `claude`, and every MCP server or hook whose argv has
 * ~/.claude in it, all say "claude". After a reboot the pid counter starts over,
 * and a SIGTERM to the process group of the wrong one kills the user's session.
 */
export function matchesRunProcess(command: string, lstart: string, binaryName: string, startedAt: string): boolean {
  if (!command.includes(binaryName)) return false
  const began = Date.parse(lstart)
  return Number.isFinite(began) && Math.abs(began - Date.parse(startedAt)) < 10_000
}

/** Runs with a live watcher in this process. A run whose tab was closed keeps
 *  its watcher until the process is gone, so "no session" is not "unwatched". */
const watching = new Set<string>()

/** A run's tab is named by its task alone: the Bot icon beside it already says it's an agent. */
export const runLabel = (title: string) => (title.length > 40 ? `${title.slice(0, 39)}…` : title)

const firstLine = (err: unknown) =>
  String((err as { stderr?: string })?.stderr || (err instanceof Error ? err.message : err))
    .trim()
    .split("\n")[0]

export type StartRunResult = { ok: true; id: string; label: string; dirty: boolean } | { ok: false; message: string }

export async function startRunImpl(
  agentId: string,
  input: { task: string; title?: string },
  deps: RunDeps = defaultRunDeps
): Promise<StartRunResult> {
  const task = input.task.trim()
  if (!task) return { ok: false, message: "Say what the agent should do first." }
  // argv cannot carry a NUL: spawn would throw after the worktree exists.
  if (task.includes("\u0000") || input.title?.includes("\u0000")) {
    return { ok: false, message: "That task contains a character that can't be handed to the agent. Remove it and try again." }
  }
  if (task.length > MAX_TASK_CHARS) {
    return { ok: false, message: `That's more than ${MAX_TASK_CHARS} characters. Shorten the task and try again.` }
  }
  const agent = (await deps.getAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company." }
  if (agent.kind !== "command-set") {
    return { ok: false, message: "This folder isn't set up as a company, so an agent has nothing to work from." }
  }
  const executor = await deps.resolveExecutor(agentId)
  if (!executor.streamingRunArgs) {
    return {
      ok: false,
      message: `Unattended agents need Claude Code for now. ${executor.label} can't yet show what it's doing while it works, so its pane would stay blank until it finished.`,
    }
  }
  // Runs and take-overs live in the main workspace, so that is the one counted.
  if (countSessions(agentId) >= MAX_SESSIONS_PER_WORKSPACE) {
    return {
      ok: false,
      message: `That's ${MAX_SESSIONS_PER_WORKSPACE} terminals and agents open in the main workspace, which is the limit. Close one you've finished with.`,
    }
  }

  const id = deps.newId()
  const title = (input.title?.trim() || task.split("\n")[0]).slice(0, 60)
  const runsDir = deps.runsDir(agentId)
  const worktreePath = deps.worktreeDir(agentId, id)
  const branch = `alacran/agent/${id}`
  const logPath = path.join(runsDir, `${id}.log`)
  await mkdir(runsDir, { recursive: true })

  const dirty = await hasUnsavedChanges(agent.rootPath, deps.exec).catch(() => false)
  let made: { gitDir: string; baseSha: string }
  try {
    made = await createRunWorktree(agent.rootPath, branch, worktreePath, deps.exec)
  } catch (err) {
    await removeRunWorktree(agent.rootPath, worktreePath, branch, deps.exec)
    return { ok: false, message: `Couldn't make a working copy for the agent: ${firstLine(err)}` }
  }

  const args = executor.streamingRunArgs({ prompt: buildRunPrompt(task, agent.name), editScopePattern: "**", bashPatterns: [] })
  let pid: number | null = null
  let record: RunRecord
  try {
    pid = spawnAgent(executor.binaryName, args, worktreePath, logPath, deps)

    record = {
    id,
    agentId,
    title,
    task,
    executorId: executor.id,
    binaryName: executor.binaryName,
    status: "running",
    pid,
    branch,
    gitDir: made.gitDir,
    baseSha: made.baseSha,
    worktreePath,
    logPath,
    startedAt: new Date(deps.now()).toISOString(),
    endedAt: null,
    reason: null,
    changedFiles: 0,
    summary: null,
    passOffset: 0,
  }
    await writeRunRecord(runsDir, record)
  } catch (err) {
    // Nothing may be left behind that no record points at: an agent running
    // with no watcher and no way to stop it, or a worktree nobody will clean.
    // We spawned this pid a moment ago, so it is ours to stop.
    if (pid !== null) deps.kill(pid)
    await removeRunWorktree(agent.rootPath, worktreePath, branch, deps.exec)
    return { ok: false, message: `Couldn't start the agent: ${firstLine(err)}` }
  }
  attachRun(record, deps)
  return { ok: true, id, label: runLabel(title), dirty }
}

/**
 * A run as a terminal session: its log, tailed and formatted, is the "pty"
 * output, so it rides the company stream, flow control and tabs like any
 * other session. A watcher polls the process; when it is gone the run settles.
 */
/** Spawn the agent detached with its output going to the run's log. Returns
 *  its pid, or null when the OS gave none (the binary couldn't start). Throws
 *  only for a synchronous spawn failure, which the caller cleans up after. */
function spawnAgent(binaryName: string, args: string[], cwd: string, logPath: string, deps: RunDeps): number | null {
  const fd = openSync(logPath, "a")
  try {
    const child = deps.spawn(binaryName, args, { cwd, detached: true, stdio: ["ignore", fd, fd] })
    // A missing binary emits "error" and never "exit" — and an unheard "error"
    // event takes the whole server down. The pane shows why instead.
    child.on("error", (err) => {
      try {
        appendFileSync(logPath, `\nAlacrán: could not start "${binaryName}" — ${err.message}\n`)
      } catch {
        /* nowhere left to say it */
      }
    })
    child.unref()
    return child.pid ?? null
  } finally {
    closeSync(fd)
  }
}

function attachRun(record: RunRecord, deps: RunDeps, opts: { fromOffset?: number; intro?: string } = {}): void {
  const tail = createLogTail(record.logPath, undefined, opts.fromOffset ?? 0)
  const roots = worktreeRoots(record.worktreePath)
  const startedMs = Date.parse(record.startedAt)
  let paused = false
  let settling = false
  /** Why WE stopped it (time limit, the tab's ×), which outranks what it reported. */
  let stopReason: string | null = null
  let result: FormattedLine["result"] | null = null
  let ticks = 0
  let cancel = () => {}

  const stop = async () => {
    if (record.pid !== null && (await deps.isRunProcess(record.pid, record.binaryName, record.startedAt))) {
      deps.kill(record.pid)
    }
  }
  const session: TerminalSession = {
    id: record.id,
    agentId: record.agentId,
    kind: "run",
    label: runLabel(record.title),
    executorId: record.executorId,
    startedAt: startedMs,
    backlog: createBacklog(MAX_BACKLOG),
    listeners: new Set(),
    // Not a pty. These are the calls the terminal code makes on a session's
    // pty: input and resizing mean nothing to a run, pausing (flow control)
    // is just not reading the log for a while, and kill is the tab's ×.
    pty: {
      pid: record.pid ?? 0,
      write: () => {},
      resize: () => {},
      pause: () => void (paused = true),
      resume: () => void (paused = false),
      kill: () => {
        if (settling || stopReason) return
        stopReason = "Stopped before it finished."
        void stop()
      },
    } as unknown as IPty,
  }
  const show = (text: string) => {
    session.backlog.push(text)
    for (const listener of session.listeners) listener(text)
  }
  const take = (lines: string[]) => {
    for (const line of lines) {
      const formatted = formatStreamLine(line, roots)
      if (formatted.result) result = formatted.result
      if (formatted.text) show(formatted.text)
    }
  }

  const tick = async () => {
    if (settling) return
    if (!paused) take(tail.read())
    if (++ticks % CHECK_EVERY_TICKS !== 0) return
    if (record.pid !== null && deps.isAlive(record.pid)) {
      if (!stopReason && deps.now() - startedMs > RUN_TIME_LIMIT_MS) {
        stopReason = "Took longer than an hour, so it was stopped."
        await stop()
      }
      return
    }
    settling = true
    cancel()
    take(tail.readRest())
    tail.close()
    const noResult = record.pid === null ? "The agent couldn't be started." : "It stopped before it finished."
    try {
      show(summaryLine(await settleRun(record, result, stopReason, { status: "failed", reason: noResult }, deps)))
    } catch (err) {
      // The record stays `running` on disk; the next restart settles it from
      // the log. Say so here rather than leaving a pane that simply stops.
      show(
        `\r\n\x1b[1;31m✗ Couldn't save how this run ended: ${firstLine(err)}\x1b[0m The agent's changes are still in its own copy.\r\n`
      )
    } finally {
      watching.delete(record.id)
    }
  }

  watching.add(record.id)
  if (opts.intro) session.backlog.push(opts.intro)
  registerSession(session)
  cancel = deps.schedule(() => tick())
}

/**
 * Save and record how a run ended. Whatever the agent changed is committed on
 * its branch in EVERY case — a run that failed half way may still hold work
 * worth keeping, and deciding that is the review card's job (Plan 3), not this.
 *
 * Order of precedence: a stop WE caused (time limit, the tab closed) wins over
 * anything the agent reported, then the agent's own result, then — when the
 * log has no result at all — `noResult`.
 */
async function settleRun(
  record: RunRecord,
  result: FormattedLine["result"] | null,
  stoppedBecause: string | null,
  noResult: { status: Extract<RunStatus, "failed" | "interrupted">; reason: string },
  deps: RunDeps
): Promise<RunRecord> {
  record.changedFiles = await commitRunWorktree(
    record.worktreePath,
    record.gitDir,
    record.baseSha,
    record.title,
    deps.exec
  ).catch(() => 0)
  record.endedAt = new Date(deps.now()).toISOString()
  record.summary = result?.summary ?? null
  if (stoppedBecause) {
    record.status = "failed"
    record.reason = stoppedBecause
  } else if (result?.ok) {
    record.status = record.changedFiles > 0 ? "needs-review" : "no-changes"
    record.reason = null
  } else if (result) {
    record.status = "failed"
    record.reason = "The agent reported an error and stopped."
  } else {
    record.status = noResult.status
    record.reason = noResult.reason
  }
  await writeRunRecord(deps.runsDir(record.agentId), record)
  return record
}

/** The last line of a run's pane: how it ended, in plain words. */
function summaryLine(record: RunRecord): string {
  const files = `${record.changedFiles} file${record.changedFiles === 1 ? "" : "s"}`
  switch (record.status) {
    case "needs-review":
      return `\r\n\x1b[1;32m✓ Finished — ${files} changed.\x1b[0m The changes are on the agent's own copy; the company's files are untouched.\r\n`
    case "no-changes":
      return "\r\n\x1b[1m✓ Finished — no files changed.\x1b[0m\r\n"
    default:
      return `\r\n\x1b[1;31m✗ ${record.reason}\x1b[0m${record.changedFiles ? ` ${files} changed before it stopped, saved on the agent's own copy.` : ""}\r\n`
  }
}

/** Each company's reconcile, once per server process. A promise rather than a
 *  flag: the page opens its stream and asks for its tab list at the same time,
 *  and the second request must wait for the runs to be back, not skip them. */
const reconciling = new Map<string, Promise<void>>()

/**
 * After a restart, sessions are gone but records are not. For every record
 * still marked `running`: reattach it if its process is alive, young enough and
 * provably still the agent — otherwise settle it from what its log says, as
 * `interrupted` when the log has no result. Once per company per process, on
 * the first terminal request (the route calls it before listing or streaming).
 */
export function reconcileRunsImpl(agentId: string, deps: RunDeps = defaultRunDeps): Promise<void> {
  let pending = reconciling.get(agentId)
  if (!pending) {
    pending = reconcileOnce(agentId, deps)
    reconciling.set(agentId, pending)
  }
  return pending
}

async function reconcileOnce(agentId: string, deps: RunDeps): Promise<void> {
  for (const record of await readRunRecords(deps.runsDir(agentId))) {
    if (record.status !== "running" || getSession(agentId, record.id) || watching.has(record.id)) continue
    // No age limit here: a run past its time limit that is provably still the
    // agent is reattached, and its watcher's first check stops it. Settling it
    // instead would leave it running with nothing watching it.
    const live =
      record.pid !== null &&
      deps.isAlive(record.pid) &&
      (await deps.isRunProcess(record.pid, record.binaryName, record.startedAt))
    if (live) {
      attachRun(record, deps, { fromOffset: record.passOffset ?? 0 })
      continue
    }
    let result: FormattedLine["result"] | null = null
    try {
      // Only the current pass: an earlier pass's success says nothing about this one.
      const log = (await readFile(record.logPath)).subarray(record.passOffset ?? 0).toString("utf-8")
      for (const line of log.split("\n")) {
        const formatted = formatStreamLine(line, record.worktreePath)
        if (formatted.result) result = formatted.result
      }
    } catch {
      // No log: nothing ever ran. `interrupted` below says as much.
    }
    await settleRun(record, result, null, { status: "interrupted", reason: "Alacrán closed while it was working." }, deps)
  }
}

export function _resetReconcileForTest(): void {
  reconciling.clear()
  watching.clear()
  busy.clear()
  driving.clear()
}

export type LandResult = { ok: true; message: string } | { ok: false; message: string; files?: string[] }
export type RunSummary = Pick<
  RunRecord,
  "id" | "title" | "status" | "reason" | "changedFiles" | "summary" | "startedAt" | "endedAt" | "executorId"
> & { driving: boolean }

const listFiles = (files: string[]) =>
  files.length <= 3 ? files.join(", ") : `${files.slice(0, 3).join(", ")} and ${files.length - 3} more`
const countFiles = (n: number) => `${n} file${n === 1 ? "" : "s"}`

/** Runs a person has taken over: run id → the session id of their terminal. */
const driving = new Map<string, string>()
const DRIVING = "You're working in this agent's copy right now. Close your tab first."

/** Runs with a Keep, Discard or Ask in progress in this process. */
const busy = new Set<string>()
const BUSY = "Something else is already happening to this run. Try again in a moment."

/**
 * One action on a run at a time. Claimed BEFORE the first await, so a double
 * click — or a Keep racing an Ask — can't both pass the "is it finished?"
 * check and then act on the same worktree.
 */
async function exclusively<T>(runId: string, busyResult: T, fn: () => Promise<T>): Promise<T> {
  if (busy.has(runId)) return busyResult
  busy.add(runId)
  try {
    return await fn()
  } finally {
    busy.delete(runId)
  }
}

export function keepRunImpl(agentId: string, runId: string, deps: RunDeps = defaultRunDeps): Promise<LandResult> {
  return exclusively(runId, { ok: false, message: BUSY }, () => keepRun(agentId, runId, deps))
}

/** AGENTS.md §6, Irreversible: the caller's confirm dialog is the approval. */
export function discardRunImpl(agentId: string, runId: string, deps: RunDeps = defaultRunDeps): Promise<LandResult> {
  return exclusively(runId, { ok: false, message: BUSY }, () => discardRun(agentId, runId, deps))
}

export function askForChangesImpl(
  agentId: string,
  runId: string,
  feedback: string,
  deps: RunDeps = defaultRunDeps
): Promise<{ ok: true; label: string } | { ok: false; message: string }> {
  return exclusively(runId, { ok: false as const, message: BUSY }, () => askForChanges(agentId, runId, feedback, deps))
}

/** "3 files it made that aren't saved with the company (state/a, …) were not kept" — or nothing. */
const ignoredNote = (ignored: string[], fate: string) =>
  ignored.length === 0
    ? ""
    : ` ${countFiles(ignored.length)} it made that aren't saved with the company (${listFiles(ignored)}) ${ignored.length === 1 ? "was" : "were"} ${fate}.`

/**
 * Commit whatever is in the run's copy that isn't on its branch yet, and
 * recount. Returns whether there was anything. A Take over whose commit never
 * happened (the app quit while someone drove) leaves exactly that behind, and
 * a Keep or Discard that went ahead would force-remove it with the worktree,
 * unseen and uncounted.
 */
async function catchUp(run: RunRecord, deps: RunDeps): Promise<boolean> {
  if (!(await worktreeHasChanges(run.worktreePath, run.gitDir, deps.exec))) return false
  run.changedFiles = await commitRunWorktree(run.worktreePath, run.gitDir, run.baseSha, run.title, deps.exec)
  await writeRunRecord(deps.runsDir(run.agentId), run)
  return true
}

/** A run that exists and is not working right now — the only kind a person can act on. */
async function findSettledRun(agentId: string, runId: string, deps: RunDeps): Promise<RunRecord | string> {
  const run = (await readRunRecords(deps.runsDir(agentId))).find((r) => r.id === runId)
  if (!run) return "That agent run isn't here any more."
  if (driving.has(run.id)) return DRIVING
  if (run.status === "running" || watching.has(run.id)) {
    return "This agent is still working. Wait for it to finish, or close its tab to stop it."
  }
  return run
}

/** Once kept or discarded, a run is over: its tab, record and log go. The
 *  branch and worktree are gone already; git history keeps the merge. */
async function forgetRun(run: RunRecord, deps: RunDeps): Promise<void> {
  closeSession(run.agentId, run.id) // a settled run's "kill" is a no-op
  await rm(path.join(deps.runsDir(run.agentId), `${run.id}.json`), { force: true })
  await rm(run.logPath, { force: true })
}

async function keepRun(agentId: string, runId: string, deps: RunDeps): Promise<LandResult> {
  const run = await findSettledRun(agentId, runId, deps)
  if (typeof run === "string") return { ok: false, message: run }
  if (await catchUp(run, deps).catch(() => false)) {
    return { ok: false, message: "This agent's copy has changes you haven't seen yet. Look at them, then keep it again." }
  }
  if (run.changedFiles === 0) return { ok: false, message: "This agent didn't change anything, so there's nothing to keep." }
  const agent = (await deps.getAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company." }

  const ignored = await listIgnoredFiles(run, deps.exec).catch(() => [] as string[])
  const outcome = await withRootLock(agent.rootPath, async () => {
    const merged = await mergeRunBranch(agent.rootPath, run, deps.exec)
    if (merged.ok) await removeRunWorktree(agent.rootPath, run.worktreePath, run.branch, deps.exec)
    return merged
  })
  if (outcome.ok) {
    await forgetRun(run, deps)
    const verb = run.changedFiles === 1 ? "is" : "are"
    return {
      ok: true,
      message: `Kept. ${countFiles(run.changedFiles)} from this agent ${verb} now in ${agent.name}.${ignoredNote(ignored, "not kept")}`,
    }
  }
  if (outcome.reason === "conflict") {
    return {
      ok: false,
      files: outcome.files,
      message: `This overlaps with changes made to ${agent.name} since the agent started (${listFiles(outcome.files)}). Nothing was changed.`,
    }
  }
  if (outcome.reason === "unsaved") {
    return {
      ok: false,
      files: outcome.files,
      message: `You have unsaved edits to ${listFiles(outcome.files)}. Save or undo them, then keep this again.`,
    }
  }
  if (outcome.reason === "moved") return { ok: false, message: `${outcome.detail} Nothing was changed.` }
  return { ok: false, message: `Couldn't keep it: ${outcome.detail || "git refused."}` }
}

async function discardRun(agentId: string, runId: string, deps: RunDeps): Promise<LandResult> {
  const run = await findSettledRun(agentId, runId, deps)
  if (typeof run === "string") return { ok: false, message: run }
  // The confirm named what was counted; anything uncounted must be seen first.
  if (await catchUp(run, deps).catch(() => false)) {
    return { ok: false, message: "This agent's copy has changes you haven't seen yet. Look at them before throwing them away." }
  }
  const agent = (await deps.getAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company." }
  const ignored = await listIgnoredFiles(run, deps.exec).catch(() => [] as string[])
  await withRootLock(agent.rootPath, () => removeRunWorktree(agent.rootPath, run.worktreePath, run.branch, deps.exec))
  await forgetRun(run, deps)
  return { ok: true, message: `Thrown away. ${agent.name} is unchanged.${ignoredNote(ignored, "thrown away too")}` }
}

export async function listRunsImpl(agentId: string, deps: RunDeps = defaultRunDeps): Promise<RunSummary[]> {
  return (await readRunRecords(deps.runsDir(agentId))).map(
    ({ id, title, status, reason, changedFiles, summary, startedAt, endedAt, executorId }) => ({
      id,
      title,
      status,
      reason,
      changedFiles,
      summary,
      startedAt,
      endedAt,
      executorId,
      driving: driving.has(id),
    })
  )
}

/** A run's changed files for its card, and the ignored files a keep or discard
 *  would leave behind or delete — the card must name those too. */
export async function runChangesImpl(
  agentId: string,
  runId: string,
  deps: RunDeps = defaultRunDeps
): Promise<{ files: RunChange[]; ignored: string[] } | null> {
  const run = (await readRunRecords(deps.runsDir(agentId))).find((r) => r.id === runId)
  if (!run) return null
  // Only for a finished run: a working agent's half-written files aren't its answer.
  if (run.status !== "running" && !watching.has(run.id)) await catchUp(run, deps).catch(() => false)
  return {
    files: await listRunChanges(run, deps.exec).catch(() => []),
    ignored: await listIgnoredFiles(run, deps.exec).catch(() => []),
  }
}

async function askForChanges(
  agentId: string,
  runId: string,
  feedback: string,
  deps: RunDeps
): Promise<{ ok: true; label: string } | { ok: false; message: string }> {
  const text = feedback.trim()
  if (!text) return { ok: false, message: "Say what you'd like changed first." }
  if (text.includes("\u0000")) return { ok: false, message: "That feedback contains a character that can't be handed to the agent." }
  if (text.length > MAX_TASK_CHARS) return { ok: false, message: `That's more than ${MAX_TASK_CHARS} characters. Shorten it and try again.` }
  const run = await findSettledRun(agentId, runId, deps)
  if (typeof run === "string") return { ok: false, message: run }
  // The run's OWN executor: only the CLI that holds a conversation can continue it.
  const executor = getAiExecutor(run.executorId)
  if (!executor.streamingResumeArgs) {
    return { ok: false, message: `${executor.label} can't be sent back to an unattended run yet.` }
  }
  // `--disallowedTools Bash` does nothing to stop a hook or MCP server the
  // agent wrote into the worktree; see refuseIfAgentWroteSettings.
  const unsafe = await refuseIfAgentWroteSettings(run, deps, "sent back")
  if (unsafe) return { ok: false, message: unsafe }

  closeSession(agentId, run.id) // the finished tab; re-registered below with the new pass
  let fromOffset = 0
  try {
    fromOffset = statSync(run.logPath).size
  } catch {
    /* no log yet: read from the start */
  }
  const args = executor.streamingResumeArgs({ prompt: buildFeedbackPrompt(text), editScopePattern: "**", bashPatterns: [] })
  let pid: number | null
  try {
    pid = spawnAgent(executor.binaryName, args, run.worktreePath, run.logPath, deps)
  } catch (err) {
    return { ok: false, message: `Couldn't send it back: ${firstLine(err)}` }
  }
  Object.assign(run, {
    status: "running",
    pid,
    startedAt: new Date(deps.now()).toISOString(),
    endedAt: null,
    reason: null,
    summary: null,
    passOffset: fromOffset,
  } satisfies Partial<RunRecord>)
  try {
    await writeRunRecord(deps.runsDir(agentId), run)
  } catch (err) {
    if (pid !== null) deps.kill(pid)
    return { ok: false, message: `Couldn't send it back: ${firstLine(err)}` }
  }
  attachRun(run, deps, { fromOffset, intro: `\r\n\x1b[1m── Asked for changes ──\x1b[0m\r\n${text.replace(/\r?\n/g, "\r\n")}\r\n\r\n` })
  return { ok: true, label: runLabel(run.title) }
}

/** A new Claude process in the worktree loads that folder's hooks and MCP
 *  servers as it starts; if the agent wrote those, starting one runs its code
 *  as the user. Ask for changes and Take over both start one. */
async function refuseIfAgentWroteSettings(run: RunRecord, deps: RunDeps, what: string): Promise<string | null> {
  await catchUp(run, deps).catch(() => false)
  const changed = await listRunChanges(run, deps.exec).catch(() => null)
  // Ignored files too: Claude Code's own settings.local.json is usually
  // gitignored, never committed, and loaded all the same.
  const ignored = await listIgnoredFiles(run, deps.exec).catch(() => null)
  if (!changed || !ignored) return `Couldn't check what this agent changed, so it can't be ${what} safely.`
  const settings = [...changed.map((c) => c.path), ...ignored].filter((p) => p.startsWith(".claude/") || p === ".mcp.json")
  if (settings.length === 0) return null
  return `This agent changed its own AI settings (${listFiles(settings)}). Starting it again would load settings it wrote itself, so it can't be ${what}. Keep or discard it instead.`
}

export function takeOverImpl(
  agentId: string,
  runId: string,
  deps: RunDeps = defaultRunDeps,
  open: typeof openSession = openSession
): Promise<{ ok: true; id: string; label: string } | { ok: false; message: string }> {
  return exclusively(runId, { ok: false as const, message: BUSY }, async () => {
    const run = await findSettledRun(agentId, runId, deps)
    if (typeof run === "string") return { ok: false, message: run }
    const executor = getAiExecutor(run.executorId)
    if (!executor.interactiveResumeArgs) return { ok: false, message: `${executor.label} can't be taken over yet.` }
    const unsafe = await refuseIfAgentWroteSettings(run, deps, "taken over")
    if (unsafe) return { ok: false, message: unsafe }
    if (countSessions(agentId) >= MAX_SESSIONS_PER_WORKSPACE) {
      return { ok: false, message: `That's ${MAX_SESSIONS_PER_WORKSPACE} terminals and agents open in the main workspace. Close one first.` }
    }
    const sessionId = `${run.id}t`
    const session = await open({
      agentId,
      sessionId,
      cwd: run.worktreePath,
      kind: "ai",
      label: `${TAKEOVER_PREFIX}${run.title.length > 28 ? `${run.title.slice(0, 27)}…` : run.title}`,
      executorId: executor.id,
      launch: { file: executor.binaryName, args: executor.interactiveResumeArgs },
      onExit: () => void finishDriving(run, deps),
    })
    if (!session) return { ok: false, message: `Couldn't open ${executor.label} in the agent's copy.` }
    driving.set(run.id, sessionId)
    return { ok: true, id: sessionId, label: session.label }
  })
}

/** The person closed their terminal: save what they changed on the run's
 *  branch and put the run back in front of them for review. */
async function finishDriving(run: RunRecord, deps: RunDeps): Promise<void> {
  try {
    // The person had a full terminal: if they moved the copy off the run's own
    // branch, committing now would put their work somewhere Keep never looks.
    const head = (await deps.exec("git", ["--git-dir", run.gitDir, "symbolic-ref", "-q", "HEAD"]).catch(() => ({ stdout: "" }))).stdout.trim()
    if (head !== `refs/heads/${run.branch}`) {
      run.status = "failed"
      run.reason =
        "You moved the agent's copy to a different branch, so what you changed there isn't part of this run. Take over again and switch back to its own branch, or discard it."
      run.endedAt = new Date(deps.now()).toISOString()
      await writeRunRecord(deps.runsDir(run.agentId), run)
      return
    }
    // Nothing touched — no edits left, and nothing the person committed
    // themselves — the run is exactly as it was, including WHY it stopped
    // ("Took longer than an hour"): a look around must not erase that.
    const dirty = await worktreeHasChanges(run.worktreePath, run.gitDir, deps.exec)
    const changed = await commitRunWorktree(run.worktreePath, run.gitDir, run.baseSha, `${run.title} (taken over)`, deps.exec)
    if (!dirty && changed === run.changedFiles) return
    run.changedFiles = changed
    run.status = run.changedFiles > 0 ? "needs-review" : "no-changes"
    run.reason = null
    run.endedAt = new Date(deps.now()).toISOString()
    await writeRunRecord(deps.runsDir(run.agentId), run)
  } catch {
    // The edits are still in the worktree: the next Keep, Discard or look at
    // the changes commits and counts them first (catchUp).
  } finally {
    driving.delete(run.id)
  }
}

/** A file's text before the run and now, for the changes drawer — only for a
 *  file in this run's own change list, so the endpoint can't be used to read
 *  anything else. Capped: a drawer is for reading, not for 5MB of JSON. */
export async function runFileDiffImpl(
  agentId: string,
  runId: string,
  file: string,
  deps: RunDeps = defaultRunDeps
): Promise<{ before: string; after: string; notice?: string } | null> {
  const run = (await readRunRecords(deps.runsDir(agentId))).find((r) => r.id === runId)
  if (!run) return null
  const changes = await listRunChanges(run, deps.exec).catch(() => [])
  if (!changes.some((c) => c.path === file)) return null
  // Asked for its size first: git would hand back a 5MB file whole, past what
  // the exec buffer allows, and a drawer is for reading, not for that.
  // Either side too big or not text and the drawer says so INSTEAD of a diff:
  // the sentence diffed against the other side would read as the agent having
  // deleted (or written) the whole file.
  const TOO_LARGE = "This file is too large to show here."
  const NOT_TEXT = "This file isn't text, so it can't be shown here."
  const show = async (rev: string): Promise<string | { notice: string }> => {
    try {
      const size = Number((await deps.exec("git", ["--git-dir", run.gitDir, "cat-file", "-s", `${rev}:${file}`])).stdout.trim())
      if (size > 200_000) return { notice: TOO_LARGE }
      const text = (await deps.exec("git", ["--git-dir", run.gitDir, "show", `${rev}:${file}`])).stdout
      return text.includes("\u0000") ? { notice: NOT_TEXT } : text
    } catch {
      return "" // not in that version: added or deleted
    }
  }
  const before = await show(run.baseSha)
  const after = await show(run.branch)
  if (typeof before !== "string" || typeof after !== "string") {
    const notice = [before, after].find((side): side is { notice: string } => typeof side !== "string")!.notice
    return { before: "", after: "", notice }
  }
  return { before, after }
}
