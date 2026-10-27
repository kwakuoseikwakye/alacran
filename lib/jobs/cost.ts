import path from "node:path"
import { appendLine, readLines } from "./store"
import { readMonthlyLimit, BUDGET_FILE } from "./definitions"
import { COMPANY_COMMANDS_DATA_DIR } from "../company-commands/paths"
import { getCompanyCommand } from "../company-commands/registry"
import { getEffectiveAgents } from "../get-effective-agents"
import type { AiExecutorId } from "../ai-executors"
import { spentAgainst, usd, type SpendingView } from "./cost-words"

export { SPENDING_COPY, usd, spentAgainst, spendingHeadline, jobMonthWords, type SpendingView } from "./cost-words"

/**
 * What each unattended AI run cost, by the AI tool's own account (v251).
 *
 * One line per run in `<company-commands data>/<companyId>/costs.jsonl`: app data, outside the
 * company folder, so no AI working in that folder can rewrite what it spent. Both run paths
 * already receive that directory as an injected seam, so no test writes to real state. The cost is
 * read only from the tool's own local output; nothing here looks a price up anywhere.
 *
 * `costUsd: null` is "cost not known" and is never added up as 0: a tool that reports nothing, a
 * killed or failed run, an unreadable result, or a visible-terminal run Node never sees end.
 */
export type CostEntry = {
  /** `agentId:commandId` (the schedule-key shape) or SESSION_NOTES_JOB. */
  job: string
  executorId: AiExecutorId
  startedAt: string
  finishedAt: string | null
  costUsd: number | null
}

export const SESSION_NOTES_JOB = "session-notes"
const LEDGER = "costs.jsonl"

export function commandJob(agentId: string, commandId: string): string {
  // Written inline rather than importing scheduleKey: schedules-impl imports the run path, which imports this.
  return `${agentId}:${commandId}`
}

function parseResult(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line)
    if (value && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type === "result") {
      return value as Record<string, unknown>
    }
  } catch {
    // not a result line
  }
  return null
}

/**
 * The run's own reported cost, from the log segment it wrote: the last non-empty line, if that is a
 * successful result event with a finite, non-negative `total_cost_usd`. Anything else is null.
 */
export function readReportedCost(output: string, exitCode: number | null): number | null {
  if (exitCode !== 0) return null
  const last = output.split("\n").map((l) => l.trim()).filter(Boolean).pop()
  if (!last) return null
  const result = parseResult(last)
  if (!result || result.subtype !== "success" || result.is_error === true) return null
  const cost = result.total_cost_usd
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null
}

/** The log as the owner should read it: a result event becomes its answer text; every other line is unchanged. */
export function readableRunLog(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const result = parseResult(line.trim())
      if (!result) return line
      if (typeof result.result === "string" && result.result !== "") return result.result
      return result.is_error === true ? "The run ended with an error." : ""
    })
    .join("\n")
}

export async function recordRunCost(dataDir: string, entry: CostEntry): Promise<void> {
  await appendLine(path.join(dataDir, LEDGER), entry)
}

export async function readCostLedger(dataDir: string): Promise<CostEntry[]> {
  return readLines<CostEntry>(path.join(dataDir, LEDGER))
}

/** "YYYY-MM" in this machine's local time, the same clock schedules run on. */
export function localMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export type JobSpend = { monthUsd: number; lastCostUsd: number | null; lastAt: string; runs: number; knownRuns: number }

/** This local calendar month's known total, the number of runs whose cost isn't known, and each job's share. */
export function monthSpending(entries: CostEntry[], now: Date): { knownUsd: number; unknownRuns: number; byJob: Map<string, JobSpend> } {
  const month = localMonth(now)
  let knownUsd = 0
  let unknownRuns = 0
  const byJob = new Map<string, JobSpend>()
  for (const e of entries) {
    const at = e.finishedAt ?? e.startedAt
    const when = new Date(at)
    if (Number.isNaN(when.getTime()) || localMonth(when) !== month) continue
    const cost = typeof e.costUsd === "number" && Number.isFinite(e.costUsd) ? e.costUsd : null
    if (cost === null) unknownRuns++
    else knownUsd += cost
    const job = byJob.get(e.job) ?? { monthUsd: 0, lastCostUsd: null, lastAt: "", runs: 0, knownRuns: 0 }
    job.monthUsd += cost ?? 0
    job.runs++
    if (cost !== null) job.knownRuns++
    if (at >= job.lastAt) {
      job.lastAt = at
      job.lastCostUsd = cost
    }
    byJob.set(e.job, job)
  }
  return { knownUsd, unknownRuns, byJob }
}

export type LimitCheck = { blocked: false } | { blocked: true; message: string }

/**
 * Should Alacrán start an AI run on its own for this company right now? Only the unattended paths
 * ask; a run the owner starts by hand never does. A limit file that can't be read blocks: on the
 * Money row, unsure means the gate fired.
 */
export async function checkMonthlyLimit(
  agent: { id: string; rootPath: string },
  now: Date,
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR,
  /** What the owner can do about it, appended when the limit is reached. Only a schedule has a Run button. */
  whatNext = ""
): Promise<LimitCheck> {
  const limit = await readMonthlyLimit(agent.rootPath).catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }))
  if (!limit.ok) {
    return {
      blocked: true,
      message: `The monthly limit in ${BUDGET_FILE} can't be read: ${limit.reason} Alacrán won't start AI runs on its own until it's fixed.`,
    }
  }
  if (limit.limitUsd === null) return { blocked: false }
  const { knownUsd } = monthSpending(await readCostLedger(path.join(dataRoot, agent.id)), now)
  if (knownUsd < limit.limitUsd) return { blocked: false }
  return {
    blocked: true,
    message: `Not started: this month's limit of ${usd(limit.limitUsd)} is reached (estimated so far: ${spentAgainst(knownUsd, limit.limitUsd)}).${whatNext}`,
  }
}

/** For the schedule ticker, which knows only the company id. An unknown company isn't blocked here; the run itself refuses it. */
export async function checkMonthlyLimitById(agentId: string, now: Date): Promise<LimitCheck> {
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  return agent ? checkMonthlyLimit(agent, now, undefined, " Press Run to start it yourself.") : { blocked: false }
}

/** What the Jobs page shows. Never throws: an unreadable ledger reads as no runs. */
export async function readSpendingView(
  companyId: string,
  root: string,
  now: Date = new Date(),
  dataRoot: string = COMPANY_COMMANDS_DATA_DIR
): Promise<SpendingView> {
  const entries = await readCostLedger(path.join(dataRoot, companyId)).catch(() => [])
  const { knownUsd, unknownRuns, byJob } = monthSpending(entries, now)
  const read = await readMonthlyLimit(root).catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }))
  const limit = read.ok ? { ok: true as const, usd: read.limitUsd } : { ok: false as const, reason: read.reason }
  const jobs = [...byJob.entries()]
    .map(([job, s]) => ({ job, label: jobLabel(job), ...s }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  return { monthUsd: knownUsd, unknownRuns, jobs, limit, reached: limit.ok && limit.usd !== null && knownUsd >= limit.usd }
}

function jobLabel(job: string): string {
  if (job === SESSION_NOTES_JOB) return "Automatic session notes"
  const commandId = job.slice(job.lastIndexOf(":") + 1)
  return getCompanyCommand(commandId)?.label ?? commandId
}
