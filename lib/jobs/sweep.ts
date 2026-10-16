import { randomUUID } from "node:crypto"
import { getEffectiveAgents } from "../get-effective-agents"
import { localStamp } from "../schedules/schedules-impl"
import { readJobs, readPolicies, type Job } from "./definitions"
import { runScript, type ExecFn } from "./runner"
import { processSends, type SendFn } from "./send-lane"
import { jobStore, jobsDir, type Flag, type JobStore, type RunEntry } from "./store"

/**
 * The unattended half of the 60-second tick: run every job whose time has come, once a day, with
 * no AI. Same local-wall-clock rule as daily schedules (lib/schedules/schedules-impl.ts), same
 * "today only" catch-up when the laptop was asleep, and the same never-throw contract.
 */
export type JobDeps = { exec?: ExecFn; send?: SendFn; now?: () => Date }

// One run per job at a time in this process: a script can take minutes and the tick comes every 60 s.
const running = new Set<string>()

export function isJobDue(job: Job, lastRunDate: string | undefined, firstSeen: string | undefined, today: string, nowTime: string): boolean {
  if (!job.enabled || lastRunDate === today || nowTime < job.at) return false
  // A job added after today's time waits for tomorrow, rather than firing the moment it is saved.
  if (firstSeen) {
    const [seenDate, seenTime] = firstSeen.split(" ")
    if (seenDate === today && seenTime > job.at) return false
  }
  return true
}

function summary(mode: Job["mode"], sends: RunEntry["sends"], flagCount: number): string {
  const sent = sends.filter((s) => s.result === "sent").length
  const would = sends.filter((s) => s.result === "would-send").length
  return [
    mode === "shadow" ? "Practice run" : "Ran",
    sent ? `sent ${sent}` : "",
    would ? `would have sent ${would}` : "",
    flagCount ? `${flagCount} need${flagCount === 1 ? "s" : ""} you` : "",
  ]
    .filter(Boolean)
    .join(", ")
}

export async function runJob(root: string, job: Job, store: JobStore, deps: JobDeps = {}): Promise<RunEntry> {
  const now = deps.now ?? (() => new Date())
  const started = now()
  const date = localStamp(started).date
  const base = {
    runId: `${started.toISOString()}-${job.id}-${randomUUID().slice(0, 6)}`,
    jobId: job.id,
    date,
    startedAt: started.toISOString(),
    mode: job.mode,
  }
  // Stamped before the script starts, so a crash or a quit mid-run cannot fire it twice today.
  await store.updateState((s) => ({ ...s, lastRun: { ...s.lastRun, [job.id]: { date, status: "ok", message: "Running…" } } }))

  const result = await runScript(root, job, job.mode, deps.exec)
  let entry: RunEntry
  if (!result.ran) {
    entry = {
      ...base,
      finishedAt: now().toISOString(),
      status: "refused",
      message: result.reason,
      exitCode: null,
      did: [],
      flagged: [{ item: job.id, reason: `Couldn't start: ${result.reason}` }],
      sends: [],
    }
  } else {
    const report = result.report
    const flagged: Flag[] = [...(report?.flagged ?? [])]
    if (result.reportError) flagged.push({ item: job.id, reason: result.reportError })
    const failed = result.timedOut || result.exitCode !== 0
    let sends: RunEntry["sends"] = []
    if (failed) {
      flagged.push({ item: job.id, reason: result.timedOut ? "The job ran too long and was stopped." : `The job failed (exit ${result.exitCode ?? "unknown"}).` })
    } else if (report?.send.length) {
      // A failed run sends nothing: its list of who to write to is exactly what can't be trusted.
      const policies = await readPolicies(root)
      if (!policies.ok) {
        flagged.push({ item: job.id, reason: `Nothing was sent: the send policies file can't be read (${policies.reason}).` })
      } else {
        const lane = await processSends({ root, jobId: job.id, mode: job.mode, requests: report.send, policies: policies.items, store, now: started, send: deps.send })
        sends = lane.outcomes
        flagged.push(...lane.flags)
      }
    }
    entry = {
      ...base,
      finishedAt: now().toISOString(),
      status: failed ? "failed" : "ok",
      message: failed ? flagged[flagged.length - 1].reason : summary(job.mode, sends, flagged.length),
      exitCode: result.exitCode,
      did: report?.did ?? [],
      flagged,
      ...(report?.outcome ? { outcome: report.outcome } : {}),
      sends,
      ...(failed && result.stderrTail ? { stderrTail: result.stderrTail } : {}),
    }
  }
  await store.appendRun(entry)
  await store.updateState((s) => ({ ...s, lastRun: { ...s.lastRun, [job.id]: { date, status: entry.status, message: entry.message } } }))
  return entry
}

/** Run one job now, whatever the clock says (the Run now button). `null` while it is already running. */
export async function runJobNow(companyId: string, root: string, job: Job, deps: JobDeps = {}, storeRoot?: string): Promise<RunEntry | null> {
  const key = `${companyId}:${job.id}`
  if (running.has(key)) return null
  running.add(key)
  try {
    return await runJob(root, job, jobStore(jobsDir(companyId, storeRoot)), deps)
  } finally {
    running.delete(key)
  }
}

export async function runDueJobsImpl(
  deps: JobDeps = {},
  agents?: { id: string; rootPath: string }[],
  storeRoot?: string
): Promise<number> {
  const now = (deps.now ?? (() => new Date()))()
  const { date, time } = localStamp(now)
  let ran = 0
  for (const agent of agents ?? (await getEffectiveAgents())) {
    const jobs = await readJobs(agent.rootPath).catch(() => null)
    if (!jobs?.ok || jobs.items.length === 0) continue
    const store = jobStore(jobsDir(agent.id, storeRoot))
    const state = await store.readState()
    const unseen = jobs.items.filter((j) => !state.firstSeen[j.id])
    if (unseen.length) {
      const stamp = `${date} ${time}`
      await store.updateState((s) => ({ ...s, firstSeen: { ...Object.fromEntries(unseen.map((j) => [j.id, stamp])), ...s.firstSeen } }))
      for (const j of unseen) state.firstSeen[j.id] = stamp
    }
    // Sequential, like schedules: a laptop waking past several jobs should not start them all at once.
    for (const job of jobs.items) {
      if (!isJobDue(job, state.lastRun[job.id]?.date, state.firstSeen[job.id], date, time)) continue
      const key = `${agent.id}:${job.id}`
      if (running.has(key)) continue
      running.add(key)
      try {
        await runJob(agent.rootPath, job, store, deps)
        ran++
      } catch {
        // One broken job never stops the others or the tick.
      } finally {
        running.delete(key)
      }
    }
  }
  return ran
}
