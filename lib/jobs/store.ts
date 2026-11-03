import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { dataPath } from "../data-dir"
import { withFileLock } from "../os/records/write"
import type { Mail } from "./send-lane"

/**
 * Operational state for unattended jobs. It lives in app data, outside the company folder, on
 * purpose: the sent-log and the policy approvals are what stop a job over-sending, so they must
 * sit out of reach of any AI working in that folder, and none of it is company memory.
 *
 * One file per writer where it matters: the sweep writes state.json and the two logs, the owner's
 * actions write approvals.json and handled.json. Every read-modify-write still goes through the
 * per-path lock, because the Run now button and the tick can meet.
 */
export type RunStatus = "ok" | "failed" | "refused"

export type Flag = { item: string; reason: string }
export type SendOutcome = { policy: string; to: string; result: "sent" | "would-send" | "refused"; reason?: string }

export type HoldRow = "publication" | "money" | "credentials"
export type HoldOutcome = { row: HoldRow; title: string; result: "held" | "already-waiting" | "would-hold" }

/**
 * One step a job held for the owner (v248). Only the owner's decision in the app moves it off
 * `pending`; `sending` is the claim that makes a mail go out at most once. `clearedAt` is a failed
 * send the owner has seen and cleared from Approvals; it stays in the job's history.
 */
export type HeldStatus = "pending" | "sending" | "sent" | "failed" | "approved" | "rejected"
export type HeldAction = {
  id: string
  key: string
  jobId: string
  runId: string
  row: HoldRow
  title: string
  detail: string
  mail?: Mail
  createdAt: string
  status: HeldStatus
  decidedAt?: string
  sentAt?: string
  reason?: string
  clearedAt?: string
}

export type RunEntry = {
  runId: string
  jobId: string
  date: string
  startedAt: string
  finishedAt: string
  mode: "shadow" | "live"
  status: RunStatus
  message: string
  exitCode: number | null
  did: string[]
  flagged: Flag[]
  outcome?: { label: string; value: number }
  sends: SendOutcome[]
  holds?: HoldOutcome[]
  stderrTail?: string
}

export type SentEntry = { policy: string; to: string; at: string; jobId: string; subject: string }
export type Approval = { policyHash: string; templateHash: string; approvedAt: string }
export type JobState = {
  lastRun: Record<string, { date: string; status: RunStatus; message: string }>
  firstSeen: Record<string, string>
}

export function jobsDir(companyId: string, root: string = dataPath("jobs")): string {
  return path.join(root, companyId)
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T
  } catch {
    return fallback
  }
}

/** Like readJson, but only a missing file is empty: a file that can't be parsed throws instead of reading as nothing. */
async function readJsonStrict<T>(file: string, fallback: T): Promise<T> {
  let raw: string
  try {
    raw = await readFile(file, "utf-8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback
    throw error
  }
  return JSON.parse(raw) as T
}

/** Write to a sibling and rename, so a crash mid-write never leaves half a file behind. */
async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf-8")
  await rename(tmp, file)
}

async function update<T>(file: string, fallback: T, change: (value: T) => T): Promise<T> {
  return withFileLock(file, async () => {
    const next = change(await readJson(file, fallback))
    await writeJsonAtomic(file, next)
    return next
  })
}

export async function readLines<T>(file: string): Promise<T[]> {
  let raw: string
  try {
    raw = await readFile(file, "utf-8")
  } catch {
    return []
  }
  const out: T[] = []
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as T)
    } catch {
      // A torn last line (crash mid-append) is skipped, never fatal.
    }
  }
  return out
}

export async function appendLine(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await withFileLock(file, () => appendFile(file, JSON.stringify(value) + "\n", "utf-8"))
}

export type JobStore = ReturnType<typeof jobStore>

export function jobStore(dir: string) {
  const file = (name: string) => path.join(dir, name)
  const emptyState: JobState = { lastRun: {}, firstSeen: {} }
  return {
    dir,
    readState: () => readJson<JobState>(file("state.json"), emptyState),
    updateState: (change: (s: JobState) => JobState) => update<JobState>(file("state.json"), emptyState, change),
    readApprovals: () => readJson<Record<string, Approval>>(file("approvals.json"), {}),
    updateApprovals: (change: (a: Record<string, Approval>) => Record<string, Approval>) =>
      update<Record<string, Approval>>(file("approvals.json"), {}, change),
    readHandled: () => readJson<string[]>(file("handled.json"), []),
    markHandled: (key: string) =>
      update<string[]>(file("handled.json"), [], (keys) => (keys.includes(key) ? keys : [...keys, key].slice(-2000))),
    readHeld: () => readJsonStrict<HeldAction[]>(file("held.json"), []),
    // Never the general `update`: it reads a broken file as empty and would wipe the queue on write.
    updateHeld: <R>(change: (held: HeldAction[]) => { held: HeldAction[]; result: R }) =>
      withFileLock(file("held.json"), async () => {
        const { held, result } = change(await readJsonStrict<HeldAction[]>(file("held.json"), []))
        await writeJsonAtomic(file("held.json"), held)
        return result
      }),
    readRuns: () => readLines<RunEntry>(file("runs.jsonl")),
    appendRun: (entry: RunEntry) => appendLine(file("runs.jsonl"), entry),
    readSent: () => readLines<SentEntry>(file("sent.jsonl")),
    appendSent: (entry: SentEntry) => appendLine(file("sent.jsonl"), entry),
  }
}

/** A flag's stable key: its run plus its position in that run's list. */
export function flagKey(runId: string, index: number): string {
  return `${runId}#${index}`
}
