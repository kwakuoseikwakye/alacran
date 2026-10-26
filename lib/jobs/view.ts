import { readJobs, readPolicies, type Invalid, type Job, type Policy } from "./definitions"
import { checkPolicy } from "./send-lane"
import { isOpenHeld } from "./held-words"
import { localStamp } from "../schedules/schedules-impl"
import { flagKey, jobStore, jobsDir, type Flag, type HeldAction, type RunEntry } from "./store"

/**
 * What the Jobs page and Approvals read. Everything here is a file read; no script runs and no
 * mail is sent from a render.
 */
export type OpenFlag = Flag & { key: string; jobId: string; runId: string; date: string }

export type JobView = Job & {
  /** This job's held steps, newest first: the history of what the owner decided (v248). */
  held: HeldAction[]
  lastRun: RunEntry | null
  recent: RunEntry[]
  missed: boolean
}

export type PolicyView = Policy & { approved: boolean; reason: string | null; approvedAt: string | null; sentTotal: number }

export type JobsView =
  | { ok: false; reason: string }
  | { ok: true; jobs: JobView[]; invalidJobs: Invalid[]; policies: PolicyView[]; invalidPolicies: Invalid[]; policiesError: string | null; flags: OpenFlag[]; heldError: boolean }

function yesterday(now: Date): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return localStamp(d).date
}

/** Unhandled flags from each job's latest finished run. A newer run supersedes an older run's flags. */
export function openFlagsFrom(runs: RunEntry[], handled: string[]): OpenFlag[] {
  const latest = new Map<string, RunEntry>()
  for (const run of runs) latest.set(run.jobId, run)
  const done = new Set(handled)
  return [...latest.values()].flatMap((run) =>
    run.flagged
      .map((flag, index) => ({ ...flag, key: flagKey(run.runId, index), jobId: run.jobId, runId: run.runId, date: run.date }))
      .filter((flag) => !done.has(flag.key))
  )
}

export async function openFlags(companyId: string, storeRoot?: string): Promise<OpenFlag[]> {
  const store = jobStore(jobsDir(companyId, storeRoot))
  const [runs, handled] = await Promise.all([store.readRuns(), store.readHandled()])
  return openFlagsFrom(runs, handled)
}


/** Never throws. `ok: false` means the queue file can't be read, which the page says rather than showing an empty list. */
export async function openHeld(companyId: string, storeRoot?: string): Promise<{ ok: true; items: HeldAction[] } | { ok: false }> {
  try {
    return { ok: true, items: (await jobStore(jobsDir(companyId, storeRoot)).readHeld()).filter(isOpenHeld) }
  } catch {
    return { ok: false }
  }
}

/**
 * For the Approvals badge: open flags plus open held steps. Every sum site goes through here, so
 * the totals agree. Never throws: a broken file counts 0 rather than take down every page's layout.
 */
export async function openFlagCount(companyId: string, storeRoot?: string): Promise<number> {
  const flags = (await openFlags(companyId, storeRoot).catch(() => [])).length
  const held = await openHeld(companyId, storeRoot)
  return flags + (held.ok ? held.items.length : 0)
}

export async function readJobsView(companyId: string, root: string, now: Date = new Date(), storeRoot?: string): Promise<JobsView> {
  const jobs = await readJobs(root).catch((e: Error) => ({ ok: false as const, reason: e.message }))
  if (!jobs.ok) return { ok: false, reason: jobs.reason }
  const policies = await readPolicies(root).catch((e: Error) => ({ ok: false as const, reason: e.message }))
  const store = jobStore(jobsDir(companyId, storeRoot))
  const [runs, state, approvals, sent, handled, held] = await Promise.all([
    store.readRuns(),
    store.readState(),
    store.readApprovals(),
    store.readSent(),
    store.readHandled(),
    store.readHeld().catch(() => null),
  ])
  const before = yesterday(now)
  const jobViews: JobView[] = jobs.items.map((job) => {
    const mine = runs.filter((r) => r.jobId === job.id)
    const lastDate = state.lastRun[job.id]?.date
    const seen = state.firstSeen[job.id]?.split(" ")[0]
    // "Didn't run": on, known since before yesterday, and no run yesterday or since.
    const missed = job.enabled && seen !== undefined && seen < before && (lastDate === undefined || lastDate < before)
    const heldHere = (held ?? []).filter((h) => h.jobId === job.id).reverse().slice(0, 20)
    return { ...job, held: heldHere, lastRun: mine.at(-1) ?? null, recent: mine.slice(-10).reverse(), missed }
  })
  const policyViews: PolicyView[] = policies.ok
    ? await Promise.all(
        policies.items.map(async (p) => {
          const check = await checkPolicy(root, p, approvals[p.id])
          return {
            ...p,
            approved: check.ok,
            reason: check.ok ? null : check.reason,
            approvedAt: approvals[p.id]?.approvedAt ?? null,
            sentTotal: sent.filter((s) => s.policy === p.id).length,
          }
        })
      )
    : []
  return {
    ok: true,
    jobs: jobViews,
    invalidJobs: jobs.invalid,
    policies: policyViews,
    invalidPolicies: policies.ok ? policies.invalid : [],
    policiesError: policies.ok ? null : policies.reason,
    flags: openFlagsFrom(runs, handled),
    heldError: held === null,
  }
}
