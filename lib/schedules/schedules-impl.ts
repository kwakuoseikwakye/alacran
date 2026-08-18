import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { dataPath } from "../data-dir"
import { getCompanyCommand, isSchedulableCommand } from "../company-commands/registry"
import { runCompanyCommandImpl } from "../company-commands/run-company-command-impl"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import { checkRunLockStatus } from "../company-commands/run-lock"
import { getCompanyCommandResultImpl } from "../company-commands/company-command-result-impl"
import { commitCompanyCommandResultImpl } from "../company-commands/commit-company-command-result-impl"
import { getEffectiveAgents } from "../get-effective-agents"

export type Schedule = {
  agentId: string
  commandId: string
  /** "HH:MM", 24-hour, in this machine's own local time. */
  time: string
  /**
   * The local date this schedule was saved, recorded ONLY when its time had
   * already gone past that day. Without it, saving "07:00" at 15:00 would be
   * due the instant you clicked Save.
   */
  skipDate?: string
  /**
   * Commit this run's result without asking, instead of leaving it as a diff.
   * Opt-in per schedule, off by default, and refused outright for a command
   * whose prompt carries text written by people outside the company — see
   * setScheduleImpl.
   */
  autoCommit?: true
}

export type LastRun = {
  date: string
  message: string
  /**
   * Set when the ticker started an auto-commit run that hasn't been committed
   * yet. It's what stops the sweep from committing a run the *user* started
   * and deliberately left sitting there unapproved.
   */
  pendingCommit?: true
}

/**
 * Two files, on purpose. The user writes schedules.json (from the browser);
 * the ticker writes schedules-last-run.json (from the server timer). One
 * writer each means the two can never clobber each other, which is cheaper
 * and more honest than a lock around a single shared file.
 */
const SCHEDULES_PATH = dataPath("schedules.json")
const LAST_RUN_PATH = dataPath("schedules-last-run.json")

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function scheduleKey(agentId: string, commandId: string): string {
  return `${agentId}:${commandId}`
}

function two(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Local wall-clock, deliberately: "07:00" has to mean the user's 07:00 on
 * both sides of a daylight-saving change. Comparing "HH:MM" strings works
 * because they're zero-padded and fixed-width, so no date arithmetic — and
 * therefore no DST arithmetic — happens anywhere in this file.
 */
export function localStamp(now: Date): { date: string; time: string } {
  return {
    date: `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`,
    time: `${two(now.getHours())}:${two(now.getMinutes())}`,
  }
}

export function isDue(schedule: Schedule, lastRunDate: string | undefined, today: string, nowTime: string): boolean {
  const last = lastRunDate ?? schedule.skipDate
  return last !== today && nowTime >= schedule.time
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T
  } catch {
    return fallback
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8")
}

export async function getScheduleStatusImpl(
  agentId: string,
  commandId: string,
  schedulesPath: string = SCHEDULES_PATH,
  lastRunPath: string = LAST_RUN_PATH
): Promise<{ time: string | null; autoCommit: boolean; lastRun: LastRun | null }> {
  const [schedules, lastRuns] = await Promise.all([
    readJson<Schedule[]>(schedulesPath, []),
    readJson<Record<string, LastRun>>(lastRunPath, {}),
  ])
  const found = schedules.find((s) => s.agentId === agentId && s.commandId === commandId)
  return {
    time: found?.time ?? null,
    autoCommit: found?.autoCommit === true,
    lastRun: lastRuns[scheduleKey(agentId, commandId)] ?? null,
  }
}

/**
 * Save (or, with time === null, clear) one company's schedule for one command.
 *
 * Everything here arrives from the browser, so all four are checked: the
 * command has to be one this app knows, it has to be one that can run with
 * nobody at the keyboard, the time has to be a real 24-hour clock time, and
 * auto-commit has to be asked for on a command that's allowed to have it.
 * A command with a required field would otherwise fail every single night.
 */
export async function setScheduleImpl(
  agentId: string,
  commandId: string,
  time: string | null,
  autoCommit: boolean = false,
  now: Date = new Date(),
  schedulesPath: string = SCHEDULES_PATH
): Promise<{ saved: boolean; message: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) return { saved: false, message: `Unknown command "${commandId}"` }

  const schedules = (await readJson<Schedule[]>(schedulesPath, [])).filter(
    (s) => !(s.agentId === agentId && s.commandId === commandId)
  )

  if (time === null) {
    await writeJson(schedulesPath, schedules)
    return { saved: true, message: "Daily run turned off" }
  }

  if (!isSchedulableCommand(command)) {
    return { saved: false, message: `/${command.id} needs answers typed in, so it can't run on its own` }
  }
  if (!TIME_PATTERN.test(time)) {
    return { saved: false, message: "Enter a time as HH:MM (24-hour)" }
  }
  // The one thing auto-commit is never allowed on. These commands splice text
  // written by someone outside the company — an email body, a Notion page, an
  // issue — into the prompt, and the tool allowlist is what holds when a
  // prompt-injection payload gets past the fence. It confines WHERE the agent
  // writes; it cannot make what it wrote true. Committing that unread is the
  // one case where "nobody looked at it" IS the whole risk, so it's refused
  // here rather than left as a checkbox someone can tick by accident.
  if (autoCommit && command.untrustedInput) {
    return {
      saved: false,
      message:
        `/${command.id} reads text written by people outside this company, so its result always waits for you to ` +
        `read it. Schedule it without auto-commit.`,
    }
  }

  const stamp = localStamp(now)
  schedules.push({
    agentId,
    commandId,
    time,
    ...(time <= stamp.time ? { skipDate: stamp.date } : {}),
    ...(autoCommit ? { autoCommit: true as const } : {}),
  })
  await writeJson(schedulesPath, schedules)
  return {
    saved: true,
    message: autoCommit ? `Runs every day at ${time} and commits itself` : `Runs every day at ${time}`,
  }
}

export type RunFn = (
  commandId: string,
  fieldValues: Record<string, string>,
  agentId: string
) => Promise<{ started: boolean; message: string }>

/** null means "that run is still going" — try again on the next tick. */
export type SweepFn = (
  agentId: string,
  commandId: string
) => Promise<{ committed: boolean; message: string } | null>

/**
 * Finish an auto-commit run the ticker started: wait for the lock to drop,
 * read the diff the app computed itself, and commit it.
 *
 * Note what is NOT delegated. The agent still never commits — Alacrán diffs
 * the result and calls `commitCompanyCommandResultImpl`, which keeps every
 * check it has always had (the realpath containment gate, the
 * output-location gate, the single-file-scoped commit). The only thing
 * auto-commit removes is a human reading the diff first, and only on a
 * schedule that explicitly asked for it.
 */
async function commitFinishedRun(
  agentId: string,
  commandId: string
): Promise<{ committed: boolean; message: string } | null> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return { committed: false, message: `Unknown company "${agentId}"` }

  const dataDir = path.join(COMPANY_COMMANDS_DATA_DIR, agentId)
  const { running } = await checkRunLockStatus(dataDir)
  if (running) return null

  const result = await getCompanyCommandResultImpl(commandId, dataDir, agent.rootPath)
  if (!result.changed) return { committed: false, message: result.message }
  return commitCompanyCommandResultImpl(commandId, result.outputPath, agentId)
}

/**
 * Fire every schedule that's due and hasn't already had its turn today.
 *
 * It calls the same runCompanyCommandImpl the Run button does, with no
 * arguments, which is the entire point: the tool scoping, the untrusted-input
 * refusal, the per-company run lock and the before-snapshot all come along
 * unchanged. Nothing here commits anything — the result sits on disk as a
 * pending diff until a human approves it, exactly like a run you started
 * yourself.
 */
export async function runDueSchedulesImpl(
  now: Date = new Date(),
  runFn: RunFn = runCompanyCommandImpl,
  schedulesPath: string = SCHEDULES_PATH,
  lastRunPath: string = LAST_RUN_PATH,
  sweepFn: SweepFn = commitFinishedRun
): Promise<number> {
  const schedules = await readJson<Schedule[]>(schedulesPath, [])
  if (schedules.length === 0) return 0

  const lastRuns = await readJson<Record<string, LastRun>>(lastRunPath, {})
  const { date, time } = localStamp(now)
  let started = 0
  let dirty = false

  // Sweep BEFORE firing anything new. A run that finished while the app was
  // closed still has its diff on disk, and today's run would retake the
  // before-snapshot and bury it — the same trap run-company-command-impl.ts
  // already documents for refusals.
  //
  // ponytail: `pendingCommit` is the only thing separating "the ticker started
  // this" from "the user did"; a manual run started in the 60 seconds after a
  // scheduled one finished would be committed in its place. Narrow enough to
  // live with — same command, same company, same scoped output folder. Fix by
  // stamping the run record with who started it if it ever bites.
  for (const schedule of schedules) {
    const key = scheduleKey(schedule.agentId, schedule.commandId)
    const last = lastRuns[key]
    if (!last?.pendingCommit) continue
    const outcome = await sweepFn(schedule.agentId, schedule.commandId)
    if (!outcome) continue
    lastRuns[key] = {
      date: last.date,
      message: outcome.committed ? "Ran and committed automatically" : outcome.message,
    }
    dirty = true
  }

  // Sequential on purpose: a machine that was asleep past several schedules
  // wakes up with all of them due at once, and firing nine agent CLIs in
  // parallel on someone's laptop is a worse outcome than finishing a minute
  // later. The per-company run lock would reject most of them anyway.
  for (const schedule of schedules) {
    const key = scheduleKey(schedule.agentId, schedule.commandId)
    if (!isDue(schedule, lastRuns[key]?.date, date, time)) continue
    const outcome = await runFn(schedule.commandId, {}, schedule.agentId)
    // Stamped whether or not it started. Stamping only successes would turn a
    // permanent refusal — wrong executor, unknown company — into a retry every
    // minute until midnight; keeping the message means the reason is still
    // there to show instead of the run just vanishing.
    lastRuns[key] = {
      date,
      message: outcome.message,
      ...(outcome.started && schedule.autoCommit ? { pendingCommit: true as const } : {}),
    }
    dirty = true
    if (outcome.started) started++
  }

  if (dirty) await writeJson(lastRunPath, lastRuns)
  return started
}
