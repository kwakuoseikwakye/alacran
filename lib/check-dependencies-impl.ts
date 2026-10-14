import { isBinaryPresent } from "./binary-present"
import { defaultExecFile } from "./default-exec-file"
import { isClaudeCodeCli } from "./is-claude-code-cli"

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

export type DependencyStatus = { claude: boolean; gog: boolean }

export async function checkDependenciesImpl(execFn: ExecFileFn = defaultExecFile): Promise<DependencyStatus> {
  // claude gets the same real behavior check as the Connect page (a bare
  // `which` isn't proof — see is-claude-code-cli.ts), so this onboarding
  // gate can't pass on a same-named non-CLI binary either.
  const [claude, gog] = await Promise.all([isClaudeCodeCli(execFn), isBinaryPresent(execFn, "gog")])
  return { claude, gog }
}
