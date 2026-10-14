import { spawn } from "node:child_process"
import { StringDecoder } from "node:string_decoder"
import { AI_EXECUTORS, type AiExecutorId } from "@/lib/ai-executors"
import { buildRunPrompt } from "@/lib/agent-runs/prompt"
import { prepareExecutorScope } from "@/lib/executor-scope"
import { MEASURE_COMPANY_NAME } from "./setup"
import { TASKS, type RunResult, type TaskId } from "./score"

export const RUN_LIMITS = { timeoutMs: 180_000, maxBytes: 200_000 }

export type SpawnOutcome = { code: number | null; stdout: string; stderr: string; timedOut: boolean; notFound: boolean }
export type SpawnFn = (cmd: string, args: string[], opts: { cwd: string; timeoutMs: number; maxBytes: number }) => Promise<SpawnOutcome>

export const realSpawn: SpawnFn = (cmd, args, { cwd, timeoutMs, maxBytes }) =>
  new Promise((resolve) => {
    let stdout: Buffer = Buffer.alloc(0)
    let stderr: Buffer = Buffer.alloc(0)
    const decode = (bytes: Buffer) => {
      // Keep complete UTF-8 characters; replacement characters for malformed
      // input can expand the decoded byte count, so bound the final text too.
      const text = new StringDecoder("utf8").write(bytes)
      return new StringDecoder("utf8").write(Buffer.from(text).subarray(0, maxBytes))
    }
    let timedOut = false
    let notFound = false
    let settled = false
    const settle = (code: number | null, errText?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout: decode(stdout), stderr: decode(stderr.length ? stderr : Buffer.from(errText ?? "").subarray(0, maxBytes)), timedOut, notFound })
    }
    // detached: own process group, so a timeout can kill grandchildren holding the pipes open
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], detached: true })
    const keep = (current: Buffer, chunk: Buffer) => current.length >= maxBytes ? current : Buffer.concat([current, chunk.subarray(0, maxBytes - current.length)])
    child.stdout.on("data", (c: Buffer) => { stdout = keep(stdout, c) })
    child.stderr.on("data", (c: Buffer) => { stderr = keep(stderr, c) })
    const timer = setTimeout(() => {
      timedOut = true
      try { process.kill(-child.pid!, "SIGKILL") } catch { child.kill("SIGKILL") }
      child.stdout.destroy()
      child.stderr.destroy()
      settle(null)
    }, timeoutMs)
    child.on("error", (err: NodeJS.ErrnoException) => {
      notFound = err.code === "ENOENT"
      settle(null, String(err.message))
    })
    child.on("close", (code) => settle(code))
  })

const EDIT_SCOPE = "notes/**"

function input(task: TaskId) {
  return { prompt: buildRunPrompt(TASKS[task], MEASURE_COMPANY_NAME), editScopePattern: EDIT_SCOPE, bashPatterns: [] as string[] }
}

export function planRun(id: AiExecutorId, task: TaskId): { cmd: string; args: string[]; prompt: string } {
  const executor = AI_EXECUTORS[id]
  const i = input(task)
  return { cmd: executor.binaryName, args: [...executor.buildArgs(i), ...(executor.routineModelArgs ?? [])], prompt: i.prompt }
}

const SIGNED_OUT = /log ?in|sign ?in|not (logged|signed)|unauthori[sz]ed|not authenticated|authenticat(e|ion) (required|failed)|api key|credential/i

export async function runOne(id: AiExecutorId, task: TaskId, root: string, spawnFn: SpawnFn = realSpawn): Promise<RunResult> {
  const started = Date.now()
  const seconds = () => Math.round((Date.now() - started) / 1000)
  const i = input(task)
  const plan = planRun(id, task)
  try {
    await prepareExecutorScope(id, i, root)
    const out = await spawnFn(plan.cmd, plan.args, { cwd: root, ...RUN_LIMITS })
    if (out.notFound) return { status: "unavailable", stdout: "", stderr: out.stderr, seconds: seconds() }
    if (out.timedOut) return { status: "timeout", stdout: out.stdout, stderr: out.stderr, seconds: seconds() }
    const combined = `${out.stdout}\n${out.stderr}`.trim()
    if (out.code !== 0) {
      return { status: SIGNED_OUT.test(combined) ? "unavailable" : "error", stdout: out.stdout, stderr: out.stderr, seconds: seconds() }
    }
    // a CLI that prints only a short sign-in prompt and exits 0 is signed out, not answering
    if (combined.length < 400 && SIGNED_OUT.test(combined)) return { status: "unavailable", stdout: out.stdout, stderr: out.stderr, seconds: seconds() }
    return { status: "ok", stdout: out.stdout, stderr: out.stderr, seconds: seconds() }
  } catch (err) {
    return { status: "error", stdout: "", stderr: err instanceof Error ? err.message : String(err), seconds: seconds() }
  }
}
