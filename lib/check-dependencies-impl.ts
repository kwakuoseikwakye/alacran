import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type DependencyStatus = { claude: boolean; gog: boolean }

async function isPresent(execFn: ExecFileFn, name: string): Promise<boolean> {
  try {
    await execFn("which", [name])
    return true
  } catch {
    return false
  }
}

export async function checkDependenciesImpl(execFn: ExecFileFn = defaultExecFile): Promise<DependencyStatus> {
  const [claude, gog] = await Promise.all([isPresent(execFn, "claude"), isPresent(execFn, "gog")])
  return { claude, gog }
}
