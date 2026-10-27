import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { commitFile, type ExecFileFn } from "../git-commit-file"
import { defaultExecFile } from "../default-exec-file"
import { localStamp } from "../schedules/schedules-impl"
import { BUDGET_FILE, editJob, editMonthlyLimit, JOBS_FILE, readJobs, readPolicies } from "./definitions"
import { approvePolicy, revokePolicy, sendTest, type SendFn } from "./send-lane"
import { jobStore, jobsDir } from "./store"
import { runJobNow, type JobDeps } from "./sweep"
import { decideHeld, decideMessage } from "./held"
import { appendActions } from "./action-log"

/**
 * The owner's actions on the Jobs page, kept out of the "use server" file so tests can drive them
 * with a temp company and a fake git. Every one answers with a plain sentence and never throws.
 */
export type Result = { ok: true; message: string } | { ok: false; message: string; note?: string }
export type Ctx = { companyId: string; root: string; storeRoot?: string; exec?: ExecFileFn; now?: Date }

const fail = (message: string): Result => ({ ok: false, message })

export async function setJobMode(ctx: Ctx, jobId: string, mode: "shadow" | "live"): Promise<Result> {
  const edited = await editJob(ctx.root, jobId, { mode })
  if (!edited.ok) return fail(edited.reason)
  await commitFile(ctx.root, JOBS_FILE, mode === "live" ? `Put job ${jobId} live` : `Put job ${jobId} back in practice mode`, ctx.exec ?? defaultExecFile)
  return {
    ok: true,
    message: mode === "live" ? "Live. Its next run acts for real, within your approved send policies." : "Back in practice mode. It runs, but sends nothing.",
  }
}

export async function setJobEnabled(ctx: Ctx, jobId: string, enabled: boolean): Promise<Result> {
  const edited = await editJob(ctx.root, jobId, { enabled })
  if (!edited.ok) return fail(edited.reason)
  await commitFile(ctx.root, JOBS_FILE, `${enabled ? "Turn on" : "Turn off"} job ${jobId}`, ctx.exec ?? defaultExecFile)
  return { ok: true, message: enabled ? "Turned on." : "Turned off. It won't run until you turn it back on." }
}

/**
 * Set (or, with null, remove) the company's monthly limit on unattended AI runs, as a one-file
 * commit to definitions/budget.yaml. The value arrives from the browser, so it is checked here.
 */
export async function setMonthlyLimit(ctx: Ctx, raw: string | null): Promise<Result> {
  let limit: number | null = null
  if (raw !== null) {
    const text = String(raw).trim().replace(/^\$/, "")
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return fail("Enter an amount in US dollars, like 25 or 12.50.")
    limit = Number(text)
  }
  const edited = await editMonthlyLimit(ctx.root, limit)
  if (!edited.ok) return fail(edited.reason)
  await commitFile(ctx.root, BUDGET_FILE, limit === null ? "Remove the monthly limit on AI runs" : `Set the monthly limit on AI runs to $${limit}`, ctx.exec ?? defaultExecFile)
  return {
    ok: true,
    message: limit === null
      ? "Limit removed. Alacrán starts scheduled runs and session notes whatever they cost."
      : `Limit set to $${limit.toFixed(2)} a month. Once this month's estimated cost reaches it, Alacrán stops starting AI runs on its own.`,
  }
}

export async function runNow(ctx: Ctx, jobId: string, deps: JobDeps = {}): Promise<Result> {
  const jobs = await readJobs(ctx.root)
  if (!jobs.ok) return fail(jobs.reason)
  const job = jobs.items.find((j) => j.id === jobId)
  if (!job) return fail(`No job called "${jobId}".`)
  const entry = await runJobNow(ctx.companyId, ctx.root, job, deps, ctx.storeRoot)
  if (!entry) return fail("It's already running.")
  return { ok: entry.status === "ok", message: entry.message }
}

export function decisionText(policyId: string, date: string, policy: object, subject: string): string {
  return [
    "---",
    "type: decision",
    `created: ${date}`,
    "status: active",
    "---",
    "",
    `# Approve send policy: ${policyId}`,
    "",
    "## Decision",
    "",
    `Unattended jobs may send the "${policyId}" message without a person reading each one, within the`,
    "limits below. Alacrán holds a fingerprint of this policy and its template; if either changes,",
    "sending stops until it is approved again.",
    "",
    `- Subject: ${subject}`,
    "- Policy:",
    "",
    "```json",
    JSON.stringify(policy, null, 2),
    "```",
    "",
    "## What would change our mind",
    "",
    "A complaint from a recipient, a send to the wrong person, or a flag the job raises often.",
    "Turn the policy off from the Jobs page to stop it at once.",
    "",
  ].join("\n")
}

export async function approve(ctx: Ctx, policyId: string): Promise<Result> {
  const policies = await readPolicies(ctx.root)
  if (!policies.ok) return fail(policies.reason)
  const policy = policies.items.find((p) => p.id === policyId)
  if (!policy) return fail(`No send policy called "${policyId}".`)
  const now = ctx.now ?? new Date()
  const approved = await approvePolicy(ctx.root, policy, jobStore(jobsDir(ctx.companyId, ctx.storeRoot)), now)
  if (!approved.ok) return fail(approved.reason)
  const date = localStamp(now).date
  const rel = path.posix.join("docs/decisions", `${date}-approve-send-policy-${policyId}.md`)
  try {
    await mkdir(path.join(ctx.root, "docs/decisions"), { recursive: true })
    await writeFile(path.join(ctx.root, rel), decisionText(policyId, date, policy, approved.template.subject), "utf-8")
    await commitFile(ctx.root, rel, `Approve send policy ${policyId}`, ctx.exec ?? defaultExecFile)
  } catch {
    // The approval itself is in place; only the written record of it failed.
    return { ok: true, message: "Approved. The decision note couldn't be saved to the company's history." }
  }
  return { ok: true, message: "Approved. Live jobs may now send this message within its limits." }
}

export async function revoke(ctx: Ctx, policyId: string): Promise<Result> {
  await revokePolicy(policyId, jobStore(jobsDir(ctx.companyId, ctx.storeRoot)))
  return { ok: true, message: "Turned off. Nothing more is sent under this policy until you approve it again." }
}

export async function test(ctx: Ctx, policyId: string, to: string, send?: SendFn): Promise<Result> {
  const policies = await readPolicies(ctx.root)
  if (!policies.ok) return fail(policies.reason)
  const policy = policies.items.find((p) => p.id === policyId)
  if (!policy) return fail(`No send policy called "${policyId}".`)
  const sent = await sendTest(ctx.root, policy, to, send)
  return sent.ok ? { ok: true, message: `Test sent to ${to.trim()}.` } : fail(sent.reason)
}

export async function markHandled(ctx: Ctx, key: string): Promise<Result> {
  if (!/^[\w:.-]+#\d+$/.test(key)) return fail("That item isn't valid.")
  await jobStore(jobsDir(ctx.companyId, ctx.storeRoot)).markHandled(key)
  return { ok: true, message: "Marked handled." }
}

const HELD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The owner's decision on held steps, for exactly the ids they were shown (never "whatever is
 * pending now"). Approving a held mail sends that stored message; nothing else is carried out.
 */
export async function decideHeldActions(ctx: Ctx, ids: unknown, decision: "approve" | "reject", send?: SendFn): Promise<Result> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((id) => typeof id === "string" && HELD_ID.test(id))) {
    return fail("That item isn't valid.")
  }
  const store = jobStore(jobsDir(ctx.companyId, ctx.storeRoot))
  const now = ctx.now ? () => ctx.now! : undefined
  let r
  try {
    r = await decideHeld(store, ids as string[], decision, send, now)
  } catch {
    return fail("The list of held steps can't be read right now, so nothing was changed or sent.")
  }
  // One append and one commit for the whole decision; a failure changes nothing that was decided.
  const log = await appendActions(ctx.root, r.logged, { exec: ctx.exec, now })
  const message = decideMessage(r)
  const rest = message.rest
  const problem = [message.problem, log.ok ? "" : "The action log in the company folder couldn't be updated."].filter(Boolean).join(" ")
  if (!problem) return { ok: true, message: rest }
  return rest ? { ok: false, message: problem, note: rest } : { ok: false, message: problem }
}
