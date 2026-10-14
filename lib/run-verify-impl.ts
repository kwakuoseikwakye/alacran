import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { AGENTS } from "./config"
import type { Agent } from "./adapters/types"

const execFileAsync = promisify(nodeExecFile)

export type VerifyStatus = "PASS" | "WARN" | "FAIL" | "INFO"
export type VerifyRow = { category: string; id: string; status: VerifyStatus; message: string }
export type VerifyResult = { ran: boolean; passed: boolean; rows: VerifyRow[]; message: string }

export type ExecFileFn = (
  command: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>

/** A verify script that never returns would leave the card on "Running the checks…" forever. */
const VERIFY_TIMEOUT_MS = 60_000

async function defaultExecFile(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args, { ...options, timeout: VERIFY_TIMEOUT_MS })
}

function parseRows(stdout: string): VerifyRow[] | null {
  try {
    const data = JSON.parse(stdout)
    if (!Array.isArray(data.rows)) return null
    return data.rows as VerifyRow[]
  } catch {
    return null
  }
}

const AI_COMPANY_STARTER_MAIN_ID = "ai-company-starter-main"

const NO_SCRIPT = "This company has no scripts/verify.py, so there are no checks to run."
const TIMED_OUT = "The checks took too long and were stopped."
const NOT_A_COMPANY = "This folder isn't set up as a company, so there are no checks to run."

export async function runVerifyInRoot(rootPath: string, execFn: ExecFileFn = defaultExecFile): Promise<VerifyResult> {
  const scriptPath = path.join(rootPath, "scripts", "verify.py")
  try {
    const { stdout } = await execFn("python3", [scriptPath, "--json"], { cwd: rootPath })
    const rows = parseRows(stdout)
    if (!rows) return { ran: false, passed: false, rows: [], message: "verify.py produced unparseable output" }
    return { ran: true, passed: true, rows, message: "All checks passed" }
  } catch (err) {
    // What node reports for a child it stopped at `timeout`. Whatever it had printed is partial, so
    // it is never read as a result.
    if (err && typeof err === "object" && (err as { killed?: unknown }).killed === true && (err as { signal?: unknown }).signal === "SIGTERM") {
      return { ran: false, passed: false, rows: [], message: TIMED_OUT }
    }
    const stdout = err && typeof err === "object" && "stdout" in err ? (err as { stdout: unknown }).stdout : undefined
    if (typeof stdout === "string") {
      const rows = parseRows(stdout)
      if (rows) return { ran: true, passed: false, rows, message: "Some checks failed" }
    }
    const message = err instanceof Error ? err.message : String(err)
    // Python's own wording with this exact path: a crashing script's traceback can also say "No such file".
    if (message.includes(`can't open file '${scriptPath}'`)) return { ran: false, passed: false, rows: [], message: NO_SCRIPT }
    return { ran: false, passed: false, rows: [], message }
  }
}

export async function runVerifyImpl(execFn: ExecFileFn = defaultExecFile): Promise<VerifyResult> {
  const agent = AGENTS.find((a) => a.id === AI_COMPANY_STARTER_MAIN_ID)
  if (!agent) {
    return {
      ran: false,
      passed: false,
      rows: [],
      message: `Agent "${AI_COMPANY_STARTER_MAIN_ID}" is not configured`,
    }
  }
  return runVerifyInRoot(agent.rootPath, execFn)
}

export async function runCompanyVerifyImpl(
  companyId: string,
  deps: {
    resolveRoot?: (id: string) => Promise<string | null>
    listAgents?: () => Promise<Pick<Agent, "id" | "rootPath" | "kind">[]>
    execFn?: ExecFileFn
  } = {}
): Promise<VerifyResult> {
  const listAgents = deps.listAgents ?? (async () => (await import("./get-effective-agents")).getEffectiveAgents())
  let root: string | null
  if (deps.resolveRoot) {
    root = await deps.resolveRoot(companyId)
  } else {
    const agent = (await listAgents()).find((a) => a.id === companyId)
    // External folders get Open in Terminal and nothing else (v66), so they are never a verify target,
    // but they exist: "not found" would send the owner looking for a typo.
    if (agent?.kind === "external") return { ran: false, passed: false, rows: [], message: NOT_A_COMPANY }
    root = agent?.rootPath ?? null
  }
  if (!root) return { ran: false, passed: false, rows: [], message: `Company not found: ${companyId}` }
  return runVerifyInRoot(root, deps.execFn)
}
