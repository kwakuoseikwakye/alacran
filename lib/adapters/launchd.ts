import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type LaunchdHealth = {
  loaded: boolean
  lastExitStatus: number | null
}

export type ExecFn = (label: string) => Promise<string>

export async function defaultExec(label: string): Promise<string> {
  const { stdout } = await execFileAsync("launchctl", ["list", label])
  return stdout
}

export async function checkLaunchdJob(label: string, exec: ExecFn = defaultExec): Promise<LaunchdHealth> {
  let output: string
  try {
    output = await exec(label)
  } catch {
    return { loaded: false, lastExitStatus: null }
  }
  const match = /"LastExitStatus"\s*=\s*(-?\d+);/.exec(output)
  return {
    loaded: true,
    lastExitStatus: match ? Number(match[1]) : null,
  }
}
