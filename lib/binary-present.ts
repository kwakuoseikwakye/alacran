import type { ExecFileFn } from "./terminal-launch-command"

/**
 * Whether a command is on PATH.
 *
 * `which` exiting non-zero is the answer, not an error — which is why every
 * caller wrapped it in the same try/catch, four times over
 * (check-dependencies, the Linux updater, the Connect page, and the terminal's
 * assistant launch). It takes the caller's own `execFn` rather than reaching
 * for one, so a memoized probe stays memoized (v70) and a test still injects.
 */
export async function isBinaryPresent(execFn: ExecFileFn, name: string): Promise<boolean> {
  try {
    await execFn("which", [name])
    return true
  } catch {
    return false
  }
}
