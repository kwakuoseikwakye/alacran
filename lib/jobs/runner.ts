import { execFile } from "node:child_process"
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import type { Job } from "./definitions"

/**
 * Runs one job's script: no AI, no shell. The script is a file the company keeps in its own
 * `scripts/` folder, so it is already trusted as much as anything else in that repo; what this
 * module adds is containment (the resolved file must still be inside `scripts/` after symlinks),
 * a timeout, a small fixed environment, and the report file it may write back.
 */
export const JOB_TIMEOUT_MS = 10 * 60 * 1000
const STDERR_TAIL = 2048

const ReportSchema = z.object({
  did: z.array(z.string().max(500)).max(200).default([]),
  flagged: z.array(z.object({ item: z.string().max(300), reason: z.string().max(500) })).max(200).default([]),
  outcome: z.object({ label: z.string().max(80), value: z.number() }).optional(),
  send: z
    .array(z.object({ policy: z.string(), to: z.string(), fields: z.record(z.string(), z.string()).default({}) }))
    .max(500)
    .default([]),
})
export type JobReport = z.infer<typeof ReportSchema>
export type SendRequest = JobReport["send"][number]

export type ExecResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }
export type ExecFn = (cmd: string, args: string[], opts: { cwd: string; env: Record<string, string>; timeout: number }) => Promise<ExecResult>

export const defaultExec: ExecFn = (cmd, args, opts) =>
  new Promise((resolve) => {
    // This project types NODE_ENV as required on ProcessEnv; a script deliberately gets none of the app's env.
    execFile(cmd, args, { ...opts, env: opts.env as NodeJS.ProcessEnv, maxBuffer: 4 * 1024 * 1024, killSignal: "SIGKILL" }, (error, stdout, stderr) => {
      const err = error as (Error & { killed?: boolean; code?: number | string }) | null
      resolve({
        exitCode: err ? (typeof err.code === "number" ? err.code : null) : 0,
        stdout: String(stdout),
        // A spawn failure (ENOENT for a missing python3) has a string code and no stderr of its own.
        stderr: err && typeof err.code === "string" ? `${err.message}\n${stderr}` : String(stderr),
        timedOut: Boolean(err?.killed),
      })
    })
  })

export function interpreterFor(file: string): string {
  if (file.endsWith(".py")) return "python3"
  if (file.endsWith(".sh")) return "sh"
  // The app's own node: the packaged build ships a plain Node binary, so a machine without Node still works.
  return process.execPath
}

export type ScriptRun =
  | { ran: false; reason: string }
  | { ran: true; exitCode: number | null; timedOut: boolean; stderrTail: string; report: JobReport | null; reportError: string | null }

async function containedScript(root: string, run: string): Promise<string | null> {
  try {
    const scriptsDir = await realpath(path.join(root, "scripts"))
    const file = await realpath(path.join(root, run))
    return file.startsWith(scriptsDir + path.sep) ? file : null
  } catch {
    return null
  }
}

/** The report is optional. One that is there but unreadable is said plainly, never read as "nothing to say". */
export function parseReport(raw: string | null): { report: JobReport | null; error: string | null } {
  if (raw === null || raw.trim() === "") return { report: null, error: null }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { report: null, error: "The job wrote a report that isn't valid JSON." }
  }
  const parsed = ReportSchema.safeParse(json)
  if (!parsed.success) return { report: null, error: `The job's report has the wrong shape: ${parsed.error.issues[0]?.message ?? "unknown"}` }
  return { report: parsed.data, error: null }
}

export async function runScript(
  root: string,
  job: Job,
  mode: "shadow" | "live",
  exec: ExecFn = defaultExec,
  timeout: number = JOB_TIMEOUT_MS
): Promise<ScriptRun> {
  const file = await containedScript(root, job.run)
  if (!file) return { ran: false, reason: `${job.run} doesn't exist inside this company's scripts folder.` }

  const tmp = await mkdtemp(path.join(os.tmpdir(), "alacran-job-"))
  const reportFile = path.join(tmp, "report.json")
  try {
    // A fixed, small environment: the app's own secrets and settings never reach a script.
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
      HOME: process.env.HOME ?? os.homedir(),
      LANG: process.env.LANG ?? "en_US.UTF-8",
      ...(process.env.TZ ? { TZ: process.env.TZ } : {}),
      TMPDIR: tmp,
      ALACRAN_JOB_ID: job.id,
      ALACRAN_REPORT: reportFile,
      ...(mode === "shadow" ? { ALACRAN_DRY_RUN: "1" } : {}),
    }
    const result = await exec(interpreterFor(file), [file], { cwd: root, env, timeout })
    const { report, error } = parseReport(await readFile(reportFile, "utf-8").catch(() => null))
    return {
      ran: true,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stderrTail: result.stderr.slice(-STDERR_TAIL),
      report,
      reportError: error,
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}
