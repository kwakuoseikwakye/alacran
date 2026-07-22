import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export async function commitFile(
  repoRoot: string,
  relativePath: string,
  message: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<void> {
  await execFn("git", ["-C", repoRoot, "add", "--", relativePath])
  await execFn("git", ["-C", repoRoot, "commit", "-m", message, "--", relativePath])
}
