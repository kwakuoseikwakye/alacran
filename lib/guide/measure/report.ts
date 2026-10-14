import os from "node:os"
import type { AiExecutorId } from "@/lib/ai-executors"
import type { Verdict } from "../executor-coverage"
import { TASKS, type AiRuns, type TaskId } from "./score"

export function redact(text: string, extra: string[] = []): string {
  let out = text
  // Longest first so nested paths cannot leave their private suffix behind.
  for (const path of [...extra].filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.split(path).join("<tmp>")
  }
  out = out.split(os.homedir()).join("<home>")
  out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
  out = out.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, "<redacted>")
  return out.replace(/[A-Za-z0-9_+/=-]{32,}/g, "<redacted>")
}

export type AiReport = {
  id: AiExecutorId
  cliVersion: string | null
  commands: { task: string; side: "guide" | "control"; line: string }[]
  runs: AiRuns | null
  verdict: Verdict
  reason: string
}

type ReportArgs = { date: string; reports: AiReport[]; tmpPaths: string[] }
const TASK_IDS = Object.keys(TASKS) as TaskId[]
const SIDES = ["guide", "control"] as const
const LIMITS = "Scoring is final-output-only mention scoring. Silent compliance is not detected; mentions and negations may produce false positives. No interactive-path measurement is performed."
const clip = (s: string) => s.length > 4000 ? `${s.slice(0, 4000)}\n… (cut)` : s

// Both formats consume the same sanitized evidence. Never clip raw output:
// a secret straddling the boundary would no longer match its redaction rule.
function evidence(args: ReportArgs) {
  const r = (s: string) => redact(s, args.tmpPaths)
  return {
    date: r(args.date),
    knownLimits: LIMITS,
    reports: args.reports.map((a) => ({
      id: r(a.id),
      cliVersion: a.cliVersion === null ? null : r(a.cliVersion),
      verdict: r(a.verdict),
      reason: r(a.reason),
      commands: a.commands.map((c) => ({ task: r(c.task), side: r(c.side), line: r(c.line) })),
      runs: a.runs === null ? null : Object.fromEntries(SIDES.map((side) => [
        side,
        Object.fromEntries(TASK_IDS.map((task) => {
          const run = a.runs![side][task]
          return [task, { status: r(run.status), seconds: run.seconds, stdout: clip(r(run.stdout)), stderr: clip(r(run.stderr)) }]
        })),
      ])),
    })),
  }
}

export function renderReport(args: ReportArgs): string {
  const data = evidence(args)
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ")
  const lines = [
    "# Operating guide: executor coverage report", "",
    `Measured ${data.date}. One small real run per task per AI, with the guide and without it (the control). Verdicts: follows, partial, does-not, unverified.`, "",
    `Known limits: ${data.knownLimits}`, "",
    "| AI | CLI | Verdict | Why |", "| --- | --- | --- | --- |",
    ...data.reports.map((a) => `| ${cell(a.id)} | ${cell(a.cliVersion ?? "not found")} | ${cell(a.verdict)} | ${cell(a.reason)} |`), "",
  ]
  for (const a of data.reports) {
    lines.push(`## ${a.id}`, "", `CLI: ${a.cliVersion ?? "not found"}`, "", "Commands:", "")
    for (const c of a.commands) lines.push(`- ${c.side} / ${c.task}: \`${c.line}\``)
    lines.push("")
    if (!a.runs) { lines.push("No runs were made.", ""); continue }
    for (const side of SIDES) {
      for (const task of TASK_IDS) {
        const run = a.runs[side][task]
        lines.push(`### ${side} / ${task}: ${run.status} (${run.seconds}s)`, "")
        for (const stream of ["stdout", "stderr"] as const) {
          const output = run[stream]
          const fence = "`".repeat(Math.max(3, ...Array.from(output.matchAll(/`+/g), (m) => m[0].length + 1)))
          lines.push(`**${stream}**`, "", fence, output, fence, "")
        }
      }
    }
  }
  return lines.join("\n")
}

export function renderJson(args: ReportArgs): string {
  return JSON.stringify(evidence(args), null, 2)
}
