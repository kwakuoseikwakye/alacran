import { randomUUID } from "node:crypto"
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import yaml from "yaml"
import { commitFile, type ExecFileFn } from "../git-commit-file"
import { defaultExecFile } from "../default-exec-file"
import { DEFINITIONS_REL } from "../os/departments/definitions"
import { contained } from "../os/departments/safety"
import { withFileLock } from "../os/records/write"
import { localStamp } from "../schedules/schedules-impl"

/**
 * The action log (v250): one line in `records/actions/<YYYY-MM>.md` for every external action an
 * unattended job took and every decision the owner made on a held step, committed to the company's
 * own history. The app only appends; it never rewrites or removes an earlier line. Local file and
 * local git only: nothing here reaches the network.
 *
 * An event carries only the recipient, subject, ids, the row in words, the title, the outcome and
 * the reason. Never a mail body, a template or a held step's detail.
 */
type Base = { at: Date; jobId: string }
type Mailed = Base & { to: string; subject: string; policy?: string; by: "policy" | "owner" }
export type ActionEvent =
  | (Mailed & { kind: "sent" })
  | (Mailed & { kind: "not-sent"; reason: string })
  | (Base & { kind: "approved" | "done" | "rejected"; what: string; title: string })

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** One markdown-safe line: no line breaks, cut to `max`, and no leading list or heading marker. */
export function oneLine(value: string, max = 120): string {
  let text = value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim()
  if (text.length > max) text = `${text.slice(0, max).trimEnd()}…`
  return /^[-#>*+]/.test(text) ? `\\${text}` : text
}

export function formatAction(e: ActionEvent): string {
  const { date, time } = localStamp(e.at)
  const job = `job ${oneLine(e.jobId, 60)}`
  let text: string
  if (e.kind === "sent" || e.kind === "not-sent") {
    const mail = e.kind === "sent" ? `Sent email "${oneLine(e.subject)}" to ${oneLine(e.to)}` : `Email "${oneLine(e.subject)}" to ${oneLine(e.to)} not sent: ${oneLine(e.reason)}`
    text = e.by === "policy" ? `${mail} · ${job}, policy ${oneLine(e.policy ?? "", 60)} · decided by: send policy` : `${mail} · ${job} · approved by the owner`
  } else if (e.kind === "rejected") {
    text = `Rejected: "${oneLine(e.title)}" (${e.what}) · ${job} · rejected by the owner`
  } else {
    const by = e.kind === "approved" ? "approved by the owner, to be carried out by the owner" : "marked done by the owner"
    text = `${e.what}: "${oneLine(e.title)}" · ${job} · ${by}`
  }
  return `- ${date} ${time} · ${text}`
}

function header(now: Date): string {
  return [
    "---",
    `title: Actions taken, ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    `updated: ${now.toISOString()}`,
    "---",
    "",
    "What your jobs sent and what you decided on held steps, one line each. Written by Alacrán; earlier lines are never changed.",
    "",
    "",
  ].join("\n")
}

/** Only the `updated:` line inside the leading frontmatter changes; every other byte stays. */
function touchUpdated(text: string, iso: string): string {
  const front = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text)
  if (!front) return text
  const block = front[0].replace(/^updated:.*$/m, `updated: ${iso}`)
  return block + text.slice(front[0].length)
}

/** A department the owner made before v250 may already be called Actions; its folder is theirs, not the log's. */
async function ownerHasActionsDepartment(root: string): Promise<boolean> {
  try {
    const raw = yaml.parse(await readFile(path.join(root, DEFINITIONS_REL), "utf-8")) as { departments?: unknown } | null
    return Array.isArray(raw?.departments) && raw.departments.some((d) => (d as { slug?: unknown } | null)?.slug === "actions")
  } catch {
    return false
  }
}

export type LogResult = { ok: true } | { ok: false; reason: string }

/**
 * Append every event to this month's file and commit that one path, once, under the same per-path
 * lock the job store uses. Never throws and never retries: a written but uncommitted line is picked
 * up by the next commit of the file (`git add -- <file>`).
 */
export async function appendActions(root: string, events: ActionEvent[], deps: { exec?: ExecFileFn; now?: () => Date } = {}): Promise<LogResult> {
  if (events.length === 0) return { ok: true }
  const now = (deps.now ?? (() => new Date()))()
  const rel = `records/actions/${localStamp(now).date.slice(0, 7)}.md`
  const abs = path.join(root, rel)
  let stage = "written"
  try {
    if (await ownerHasActionsDepartment(root)) {
      return { ok: false, reason: "a department you made is already called Actions; rename it so the action log can be kept" }
    }
    if (!(await contained(root, abs))) return { ok: false, reason: "the actions folder isn't a plain folder inside the company folder" }
    await mkdir(path.dirname(abs), { recursive: true })
    return await withFileLock(abs, async (): Promise<LogResult> => {
      let old: string | null = null
      try {
        if (!(await lstat(abs)).isFile()) return { ok: false, reason: `${rel} isn't a plain file` }
        old = await readFile(abs, "utf-8")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      const lines = events.map(formatAction).join("\n") + "\n"
      const next = old === null ? header(now) + lines : touchUpdated(old, now.toISOString()) + (old === "" || old.endsWith("\n") ? "" : "\n") + lines
      const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${randomUUID()}.tmp`)
      try {
        await writeFile(tmp, next, "utf-8")
        await rename(tmp, abs)
      } catch (error) {
        await rm(tmp, { force: true }).catch(() => {})
        throw error
      }
      stage = "committed"
      await commitFile(root, rel, `Log ${events.length} action${events.length === 1 ? "" : "s"}`, deps.exec ?? defaultExecFile)
      return { ok: true }
    })
  } catch {
    return { ok: false, reason: stage === "committed" ? "the line was written but couldn't be committed" : "it couldn't be written" }
  }
}
