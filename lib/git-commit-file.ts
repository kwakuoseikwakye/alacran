import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export async function commitFile(
  repoRoot: string,
  // Several paths, one commit — still pathspec-scoped, so nothing outside them
  // can be swept in. Callers that pass one path are unaffected.
  relativePath: string | string[],
  message: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<void> {
  const paths = Array.isArray(relativePath) ? relativePath : [relativePath]
  await execFn("git", ["-C", repoRoot, "add", "--", ...paths])
  await execFn("git", ["-C", repoRoot, "commit", "-m", message, "--", ...paths])
}
