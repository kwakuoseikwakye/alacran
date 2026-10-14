import type { Verdict } from "../executor-coverage"

export type TaskId = "routing" | "verify"
export type RunStatus = "ok" | "unavailable" | "error" | "timeout"
export type RunResult = { status: RunStatus; stdout: string; stderr: string; seconds: number }
export type AiRuns = { guide: Record<TaskId, RunResult>; control: Record<TaskId, RunResult> }

export const TASKS: Record<TaskId, string> = {
  routing: "Follow up with the lead Acme Co about the proposal we sent last week.",
  verify: 'Add one line saying "measurement ok" to notes/measure.md.',
}

const PATTERNS: Record<TaskId, RegExp> = {
  routing: /follow-up-lead/i,
  verify: /\/verify\b|verify\.py/i,
}

export function scoreTask(task: TaskId, output: string): boolean {
  return PATTERNS[task].test(output)
}

const TASK_IDS: TaskId[] = ["routing", "verify"]

export function verdictFor(runs: AiRuns): { verdict: Verdict; reason: string } {
  for (const side of ["guide", "control"] as const) {
    for (const task of TASK_IDS) {
      const r = runs[side][task]
      if (r.status !== "ok") return { verdict: "unverified", reason: `the ${side} ${task} run ended as ${r.status}` }
    }
  }
  const passes = (side: "guide" | "control") => TASK_IDS.filter((t) => scoreTask(t, runs[side][t].stdout)).length
  const g = passes("guide")
  const c = passes("control")
  if (g === 2 && c < 2) return { verdict: "follows", reason: `both tasks passed with the guide; the control passed ${c} of 2` }
  if (g === 0) return { verdict: "does-not", reason: "neither task passed with the guide" }
  return {
    verdict: "partial",
    reason: g === 2 ? "both tasks passed, but the control passed both too, so the guide added nothing it could not find itself" : `${g} of 2 tasks passed with the guide (control ${c} of 2)`,
  }
}
