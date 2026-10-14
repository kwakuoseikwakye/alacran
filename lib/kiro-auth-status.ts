import { memoizedExecFile } from "./exec-memo"

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

export type KiroAuthStatus = {
  loggedIn: boolean
  email?: string
  /** "SocialGoogle", "BuilderId", … — whatever the CLI reports. Shown verbatim. */
  accountType?: string
}

/**
 * Whether the user is actually signed in to Kiro.
 *
 * `aiExecutorStatus` used to say every executor but Claude Code "genuinely
 * can't be probed without spawning a session." That was true of the three
 * executors registered at the time; it is not true of Kiro.
 * `kiro-cli whoami --format json` answers it in one call, verified live
 * against 2.19.1:
 *
 *   {"accountType":"SocialGoogle","email":"…"}
 *
 * `--format` also accepts `plain` (the default, markdown) and `json-pretty`.
 * Ask for `json` explicitly — the default is prose meant for a human.
 *
 * Only the logged-IN shape was verified live; signing this machine out to
 * observe the other branch isn't an acceptable test — the same call this file
 * mirrors (claude-auth-status.ts) made the same choice for the same reason.
 * So every ambiguous signal is treated as logged out: a non-zero exit (the
 * catch), a body that isn't JSON (`Not logged in` is printed as bare text),
 * and a parsed body carrying no email.
 *
 * Memoized by default (v70): every `force-dynamic` page re-renders this.
 */
export async function readKiroAuthStatus(
  execFn: ExecFileFn = (command, args) => memoizedExecFile(command, args)
): Promise<KiroAuthStatus> {
  let stdout: string
  try {
    ;({ stdout } = await execFn("kiro-cli", ["whoami", "--format", "json"]))
  } catch {
    return { loggedIn: false }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { loggedIn: false }
  }

  const email = (parsed as { email?: unknown } | null)?.email
  if (typeof email !== "string" || email.length === 0) return { loggedIn: false }
  const accountType = (parsed as { accountType?: unknown }).accountType
  return {
    loggedIn: true,
    email,
    accountType: typeof accountType === "string" ? accountType : undefined,
  }
}
