import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import path from "node:path"
import yaml from "yaml"
import { canonicalPolicy, readOptional, type Policy } from "./definitions"
import type { SendRequest } from "./runner"
import type { Approval, Flag, JobStore, SendOutcome } from "./store"
import { outlookScriptPath } from "../outlook/outlook"

/**
 * The only way an unattended job reaches another person. A script never sends: it asks, in its
 * report, and every request is checked here against a policy the owner approved once. This is the
 * §6 Publication row turned into code rather than prompt text — the approval is a hash the app
 * holds, the caps are counted from a log the app keeps, and anything unclear becomes a flag for a
 * person instead of a guess.
 */
export const DAY_MS = 24 * 60 * 60 * 1000
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

export type Template = { subject: string; body: string; placeholders: string[] }

/** `Subject: …` on the first line, a blank line, then the body. `{{field}}` anywhere is a placeholder. */
export function parseTemplate(raw: string): Template | null {
  const match = /^Subject:[ \t]*(.+)\r?\n\r?\n([\s\S]*)$/.exec(raw)
  if (!match) return null
  const placeholders = [...new Set([...raw.matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g)].map((m) => m[1]))]
  return { subject: match[1].trim(), body: match[2], placeholders }
}

export function render(template: Template, fields: Record<string, string>): { subject: string; body: string } {
  const fill = (text: string, oneLine: boolean) =>
    text.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g, (_, key: string) => {
      const value = fields[key] ?? ""
      return oneLine ? value.replace(/[\r\n]+/g, " ") : value
    })
  return { subject: fill(template.subject, true), body: fill(template.body, false) }
}

type LoadedTemplate = { ok: true; raw: string; template: Template } | { ok: false; reason: string }

async function loadTemplate(root: string, policy: Policy): Promise<LoadedTemplate> {
  const raw = await readOptional(path.join(root, policy.template)).catch(() => null)
  if (raw === null) return { ok: false, reason: `The template ${policy.template} is missing.` }
  const template = parseTemplate(raw)
  if (!template) return { ok: false, reason: `The template ${policy.template} must start with a "Subject:" line, then a blank line.` }
  const unknown = template.placeholders.filter((p) => !policy.fields.includes(p))
  if (unknown.length) {
    return { ok: false, reason: `The template uses ${unknown.map((u) => `{{${u}}}`).join(", ")}, which the policy doesn't list in fields.` }
  }
  return { ok: true, raw, template }
}

/** `unapproved`: the only problem is the missing or stale approval (the template itself is fine). */
export type PolicyCheck = { ok: true; template: Template } | { ok: false; reason: string; unapproved?: true }

/** Is the policy still exactly what the owner approved? Reads the template fresh every time. */
export async function checkPolicy(root: string, policy: Policy, approval: Approval | undefined): Promise<PolicyCheck> {
  const loaded = await loadTemplate(root, policy)
  if (!loaded.ok) return loaded
  if (!approval) return { ok: false, unapproved: true, reason: `The send policy "${policy.id}" hasn't been approved yet.` }
  if (approval.policyHash !== sha256(canonicalPolicy(policy)) || approval.templateHash !== sha256(loaded.raw)) {
    return { ok: false, unapproved: true, reason: `The send policy "${policy.id}" or its template changed after you approved it. Approve it again to resume sending.` }
  }
  return { ok: true, template: loaded.template }
}

/** `null` = the list exists but can't be read, which stops the policy: a stop mark that can't be read can't be honoured. */
export async function readStopList(root: string, policy: Policy): Promise<Set<string> | null> {
  if (!policy.stop_list) return new Set()
  const raw = await readOptional(path.join(root, policy.stop_list)).catch(() => undefined)
  if (raw === undefined) return null
  if (raw === null || raw.trim() === "") return new Set()
  try {
    const doc = yaml.parse(raw) as unknown
    const list = Array.isArray(doc) ? doc : (doc as { stop?: unknown } | null)?.stop
    if (list === undefined || list === null) return new Set()
    if (!Array.isArray(list)) return null
    return new Set(list.filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase()))
  } catch {
    return null
  }
}

export type Mail = { to: string; subject: string; body: string }
export type SendFn = (mail: Mail) => Promise<void>

/** Sends through the same command every AI uses, with `--confirm` added by the app, never by an AI. */
export const outlookSend: SendFn = (mail) =>
  new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [outlookScriptPath(), "mail", "send", "--to", mail.to, "--subject", mail.subject, "--body", mail.body, "--confirm"],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const line = String(stderr).split("\n").find((l) => l.startsWith("error: "))
          return reject(new Error(line ? line.slice(7) : "Outlook didn't accept the message."))
        }
        try {
          if ((JSON.parse(String(stdout)) as { sent?: boolean }).sent === true) return resolve()
        } catch {
          // fall through
        }
        reject(new Error("Outlook didn't confirm the message was sent."))
      }
    )
  })

export type LaneInput = {
  root: string
  jobId: string
  mode: "shadow" | "live"
  requests: SendRequest[]
  policies: Policy[]
  store: JobStore
  now?: Date
  send?: SendFn
}

/**
 * Check, then send or record, every request one job made. Refusals a person should act on become
 * flags; the ones that are simply "not yet" (too soon since the last send, on the stop list, a
 * duplicate in this run) are recorded and stay quiet, the way the reference job does.
 */
export async function processSends(input: LaneInput): Promise<{ outcomes: SendOutcome[]; flags: Flag[] }> {
  const now = input.now ?? new Date()
  const send = input.send ?? outlookSend
  const outcomes: SendOutcome[] = []
  const flags: Flag[] = []
  if (input.requests.length === 0) return { outcomes, flags }

  const approvals = await input.store.readApprovals()
  const sent = await input.store.readSent()
  const checks = new Map<string, PolicyCheck>()
  const stops = new Map<string, Set<string> | null>()
  const sentThisRun = new Map<string, number>()
  const seen = new Set<string>()
  const policyFlagged = new Set<string>()

  const refuse = (policy: string, to: string, reason: string, flag: boolean) => {
    outcomes.push({ policy, to, result: "refused", reason })
    if (flag) flags.push({ item: to || "(no address)", reason })
  }

  for (const req of input.requests) {
    const to = req.to.trim().toLowerCase()
    const policy = input.policies.find((p) => p.id === req.policy)
    if (!policy) {
      refuse(req.policy, to, `There is no send policy called "${req.policy}".`, true)
      continue
    }
    if (!checks.has(policy.id)) checks.set(policy.id, await checkPolicy(input.root, policy, approvals[policy.id]))
    const check = checks.get(policy.id)!
    if (!check.ok) {
      // Practice comes before approval, so a practice run previews the send instead of raising it.
      // A policy-level problem is one problem: it is flagged once, not once per person.
      if (input.mode === "shadow" && check.unapproved) {
        outcomes.push({ policy: policy.id, to, result: "would-send", reason: "not approved yet" })
        continue
      }
      refuse(policy.id, to, check.reason, !policyFlagged.has(policy.id))
      policyFlagged.add(policy.id)
      continue
    }
    if (!EMAIL.test(to)) {
      refuse(policy.id, to, "That isn't a usable email address.", true)
      continue
    }
    const missing = policy.fields.filter((f) => !req.fields[f]?.trim())
    if (missing.length) {
      refuse(policy.id, to, `Missing ${missing.join(", ")}, so it wasn't sent.`, true)
      continue
    }
    const extra = Object.keys(req.fields).filter((f) => !policy.fields.includes(f))
    if (extra.length) {
      refuse(policy.id, to, `The job sent fields the policy doesn't allow: ${extra.join(", ")}.`, true)
      continue
    }
    const key = `${policy.id}\n${to}`
    if (seen.has(key)) {
      refuse(policy.id, to, "Asked twice in one run; sent at most once.", false)
      continue
    }
    seen.add(key)
    if (!stops.has(policy.id)) stops.set(policy.id, await readStopList(input.root, policy))
    const stop = stops.get(policy.id)!
    if (stop === null) {
      refuse(policy.id, to, `The stop list ${policy.stop_list} can't be read, so nothing from "${policy.id}" was sent.`, true)
      continue
    }
    if (stop.has(to)) {
      refuse(policy.id, to, "On the stop list.", false)
      continue
    }
    const previous = sent.filter((s) => s.policy === policy.id && s.to === to)
    if (previous.length >= policy.max_per_recipient) {
      refuse(policy.id, to, `Already sent ${previous.length} times, the most this policy allows. A person should follow up.`, true)
      continue
    }
    const last = previous.reduce<number>((max, s) => Math.max(max, Date.parse(s.at) || 0), 0)
    if (last && now.getTime() - last < policy.min_days_between * DAY_MS) {
      refuse(policy.id, to, `Sent less than ${policy.min_days_between} days ago.`, false)
      continue
    }
    const runCount = sentThisRun.get(policy.id) ?? 0
    if (runCount >= policy.max_per_run) {
      refuse(policy.id, to, `This run reached its limit of ${policy.max_per_run} sends for "${policy.id}".`, true)
      continue
    }
    const mail = { to, ...render(check.template, req.fields) }
    // The mail command's flag parser would read a leading dash as another flag.
    if (mail.subject.startsWith("-") || mail.body.startsWith("-")) {
      refuse(policy.id, to, "The message would start with a dash, which the mail command can't take safely.", true)
      continue
    }
    sentThisRun.set(policy.id, runCount + 1)
    if (input.mode === "shadow") {
      outcomes.push({ policy: policy.id, to, result: "would-send" })
      continue
    }
    try {
      await send(mail)
      await input.store.appendSent({ policy: policy.id, to, at: new Date().toISOString(), jobId: input.jobId, subject: mail.subject })
      outcomes.push({ policy: policy.id, to, result: "sent" })
    } catch (error) {
      refuse(policy.id, to, `Sending failed: ${(error as Error).message}`, true)
    }
  }
  return { outcomes, flags }
}

/**
 * The owner's one-time yes to a policy: the hashes go into app data, where the lane checks them.
 * The caller commits a decision file beside it, so the company's own history says what was approved.
 */
export async function approvePolicy(
  root: string,
  policy: Policy,
  store: JobStore,
  now: Date = new Date()
): Promise<{ ok: true; approval: Approval; template: Template } | { ok: false; reason: string }> {
  const loaded = await loadTemplate(root, policy)
  if (!loaded.ok) return loaded
  const approval: Approval = { policyHash: sha256(canonicalPolicy(policy)), templateHash: sha256(loaded.raw), approvedAt: now.toISOString() }
  await store.updateApprovals((all) => ({ ...all, [policy.id]: approval }))
  return { ok: true, approval, template: loaded.template }
}

export async function revokePolicy(policyId: string, store: JobStore): Promise<void> {
  await store.updateApprovals((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== policyId)))
}

/**
 * Test mode: the template, filled with sample values, to one address only. It reads no recipient
 * list and writes nothing to the sent-log, so a test can never use up anyone's cap.
 */
export async function sendTest(
  root: string,
  policy: Policy,
  to: string,
  send: SendFn = outlookSend
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const address = to.trim().toLowerCase()
  if (!EMAIL.test(address)) return { ok: false, reason: "Enter one email address." }
  const loaded = await loadTemplate(root, policy)
  if (!loaded.ok) return loaded
  const mail = render(loaded.template, Object.fromEntries(policy.fields.map((f) => [f, `[${f}]`])))
  try {
    await send({ to: address, subject: `[TEST] ${mail.subject}`, body: mail.body })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: `The test didn't send: ${(error as Error).message}` }
  }
}
