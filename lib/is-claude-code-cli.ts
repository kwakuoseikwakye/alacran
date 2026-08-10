import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

/**
 * `which claude` alone isn't proof the real Claude Code CLI is installed.
 * Real user report: they had only the Claude desktop app installed (not
 * Claude Code), and something already on their PATH named `claude` —
 * almost certainly a Homebrew Cask launcher shim for the GUI app — made
 * `which claude` succeed anyway, so this app reported "Connected" for a
 * CLI that was never actually there.
 *
 * The real CLI's own `--version` output is a cheap, reliable signature to
 * check instead — confirmed live against a real install: "2.1.226 (Claude
 * Code)". A launcher shim for the GUI app wouldn't print that.
 */
export async function isClaudeCodeCli(execFn: ExecFileFn = defaultExecFile): Promise<boolean> {
  try {
    await execFn("which", ["claude"])
  } catch {
    return false
  }
  try {
    const { stdout } = await execFn("claude", ["--version"])
    return /claude code/i.test(stdout)
  } catch {
    return false
  }
}
