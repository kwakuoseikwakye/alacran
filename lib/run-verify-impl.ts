import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"
import { AGENTS } from "./config"

const execFileAsync = promisify(nodeExecFile)

export type VerifyStatus = "PASS" | "WARN" | "FAIL" | "INFO"
export type VerifyRow = { category: string; id: string; status: VerifyStatus; message: string }
export type VerifyResult = { ran: boolean; passed: boolean; rows: VerifyRow[]; message: string }

export type ExecFileFn = (
  command: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args, options)
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

  const scriptPath = path.join(agent.rootPath, "scripts", "verify.py")

  try {
    const { stdout } = await execFn("python3", [scriptPath, "--json"], { cwd: agent.rootPath })
    const rows = parseRows(stdout)
    if (!rows) {
      return { ran: false, passed: false, rows: [], message: "verify.py produced unparseable output" }
    }
    return { ran: true, passed: true, rows, message: "All checks passed" }
  } catch (err) {
    const stdout = err && typeof err === "object" && "stdout" in err ? (err as { stdout: unknown }).stdout : undefined
    if (typeof stdout === "string") {
      const rows = parseRows(stdout)
      if (rows) {
        return { ran: true, passed: false, rows, message: "Some checks failed" }
      }
    }
    return { ran: false, passed: false, rows: [], message: err instanceof Error ? err.message : String(err) }
  }
}
