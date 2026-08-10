import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { isClaudeCodeCli } from "./is-claude-code-cli"

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
  // claude gets the same real behavior check as the Connect page (a bare
  // `which` isn't proof — see is-claude-code-cli.ts), so this onboarding
  // gate can't pass on a same-named non-CLI binary either.
  const [claude, gog] = await Promise.all([isClaudeCodeCli(execFn), isPresent(execFn, "gog")])
  return { claude, gog }
}
