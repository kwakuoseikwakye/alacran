import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import yaml from "yaml"
import { z } from "zod"

/**
 * Unattended jobs (v240): plain scripts the app runs on a daily clock with no AI, and the send
 * policies the owner approves once so a job may send without a person reading each message.
 * Both files are the company's own memory in `definitions/`; this module only reads and validates
 * them, plus the two edits the owner makes from the Jobs page (live/shadow, on/off).
 */
export const JOBS_FILE = "definitions/jobs.yaml"
export const POLICIES_FILE = "definitions/send-policies.yaml"

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
export const SCRIPT_EXTENSIONS = [".py", ".mjs", ".js", ".sh"] as const

const insideCompany = (p: string) => !path.isAbsolute(p) && !p.split(/[\\/]/).includes("..")

export const JobSchema = z.object({
  id: z.string().regex(SLUG, "id must be a lowercase slug"),
  run: z
    .string()
    .refine((p) => p.startsWith("scripts/") && insideCompany(p), "run must be a file under scripts/")
    .refine((p) => SCRIPT_EXTENSIONS.some((ext) => p.endsWith(ext)), "run must end in .py, .mjs, .js or .sh"),
  at: z.string().regex(TIME, "at must be HH:MM, 24-hour"),
  mode: z.enum(["shadow", "live"]).default("shadow"),
  enabled: z.boolean().default(true),
  note: z.string().optional(),
})
export type Job = z.infer<typeof JobSchema>

export const PolicySchema = z.object({
  id: z.string().regex(SLUG, "id must be a lowercase slug"),
  channel: z.literal("outlook"),
  template: z.string().refine(insideCompany, "template must be a path inside the company folder"),
  fields: z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)).default([]),
  max_per_recipient: z.number().int().min(1).max(10).default(2),
  min_days_between: z.number().int().min(0).max(365).default(3),
  max_per_run: z.number().int().min(1).max(100).default(10),
  stop_list: z.string().refine(insideCompany, "stop_list must be a path inside the company folder").optional(),
})
export type Policy = z.infer<typeof PolicySchema>

export type Invalid = { index: number; id: string | null; reason: string }
export type Parsed<T> = { ok: true; items: T[]; invalid: Invalid[] } | { ok: false; reason: string }

/** One bad entry never hides the good ones; a file that won't parse at all is reported, never guessed at. */
function parseList<T extends { id: string }>(raw: string | null, key: string, schema: z.ZodType<T, unknown>): Parsed<T> {
  if (raw === null || raw.trim() === "") return { ok: true, items: [], invalid: [] }
  let doc: unknown
  try {
    doc = yaml.parse(raw)
  } catch (error) {
    return { ok: false, reason: `The file isn't valid YAML: ${(error as Error).message.split("\n")[0]}` }
  }
  if (doc === null || doc === undefined) return { ok: true, items: [], invalid: [] }
  if (typeof doc !== "object" || Array.isArray(doc)) return { ok: false, reason: `The file must start with "${key}:"` }
  const list = (doc as Record<string, unknown>)[key]
  if (list === undefined || list === null) return { ok: true, items: [], invalid: [] }
  if (!Array.isArray(list)) return { ok: false, reason: `"${key}" must be a list` }
  const items: T[] = []
  const invalid: Invalid[] = []
  const seen = new Set<string>()
  list.forEach((entry, index) => {
    const rawId = typeof (entry as { id?: unknown })?.id === "string" ? (entry as { id: string }).id : null
    const result = schema.safeParse(entry)
    if (!result.success) {
      invalid.push({ index, id: rawId, reason: result.error.issues[0]?.message ?? "not valid" })
      return
    }
    if (seen.has(result.data.id)) {
      invalid.push({ index, id: result.data.id, reason: `id "${result.data.id}" is used twice` })
      return
    }
    seen.add(result.data.id)
    items.push(result.data)
  })
  return { ok: true, items, invalid }
}

export async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf-8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

export function parseJobs(raw: string | null): Parsed<Job> {
  return parseList(raw, "jobs", JobSchema)
}

export function parsePolicies(raw: string | null): Parsed<Policy> {
  return parseList(raw, "policies", PolicySchema)
}

export async function readJobs(root: string): Promise<Parsed<Job>> {
  return parseJobs(await readOptional(path.join(root, JOBS_FILE)))
}

export async function readPolicies(root: string): Promise<Parsed<Policy>> {
  return parsePolicies(await readOptional(path.join(root, POLICIES_FILE)))
}

/** One policy entry with sorted keys, so its hash ignores comments, layout and the rest of the file. */
export function canonicalPolicy(policy: Policy): string {
  return JSON.stringify(Object.fromEntries(Object.entries(policy).sort(([a], [b]) => a.localeCompare(b))))
}

/**
 * Change one job's `mode` or `enabled` in place, keeping every other line and comment the
 * `yaml` package can keep. Refuses (writes nothing) when the file won't parse or the job is absent.
 */
export async function editJob(
  root: string,
  jobId: string,
  change: { mode?: "shadow" | "live"; enabled?: boolean }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const file = path.join(root, JOBS_FILE)
  const raw = await readOptional(file)
  if (raw === null) return { ok: false, reason: "There is no jobs file yet." }
  const doc = yaml.parseDocument(raw)
  if (doc.errors.length) return { ok: false, reason: "The jobs file needs fixing before it can be changed." }
  const jobs = doc.get("jobs")
  if (!yaml.isSeq(jobs)) return { ok: false, reason: "The jobs file has no jobs list." }
  const entry = jobs.items.find((item) => yaml.isMap(item) && item.get("id") === jobId)
  if (!entry || !yaml.isMap(entry)) return { ok: false, reason: `No job called "${jobId}".` }
  if (change.mode !== undefined) entry.set("mode", change.mode)
  if (change.enabled !== undefined) entry.set("enabled", change.enabled)
  await writeFile(file, doc.toString(), "utf-8")
  return { ok: true }
}
