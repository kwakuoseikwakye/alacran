import { memoizedExecFile } from "./exec-memo"

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

export type ClaudeAuthStatus = {
  loggedIn: boolean
  email?: string
  /** "team", "pro", "max"… — whatever the CLI reports. Shown verbatim. */
  subscriptionType?: string
}

/**
 * Whether the user is actually signed in to Claude Code.
 *
 * This replaces a claim that was simply wrong. `aiExecutorStatus` used to say
 * "Installed — run an assigned company command to confirm you're signed in,"
 * on the belief that login state couldn't be read without spawning a session.
 * It can: `claude auth status` prints JSON on stdout. Verified live against
 * the real CLI:
 *
 *   { "loggedIn": true, "authMethod": "claude.ai", "apiProvider": "firstParty",
 *     "email": "…", "orgId": "…", "orgName": "…", "subscriptionType": "team" }
 *
 * For a non-technical user this is the difference between "the app says it's
 * installed but nothing works" and "you're signed in as you@example.com."
 *
 * Only the logged-IN shape was verified live — logging this machine out to
 * observe the other branch isn't an acceptable test. So both plausible
 * logged-out signals are treated as logged out: a non-zero exit (the catch)
 * and a parsed body whose `loggedIn` isn't exactly true.
 *
 * Memoized by default (v70): every `force-dynamic` page re-renders this.
 */
export async function readClaudeAuthStatus(
  execFn: ExecFileFn = (command, args) => memoizedExecFile(command, args)
): Promise<ClaudeAuthStatus> {
  let stdout: string
  try {
    ;({ stdout } = await execFn("claude", ["auth", "status"]))
  } catch {
    return { loggedIn: false }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { loggedIn: false }
  }

  const body = parsed as { loggedIn?: unknown; email?: unknown; subscriptionType?: unknown }
  if (body?.loggedIn !== true) return { loggedIn: false }

  return {
    loggedIn: true,
    email: typeof body.email === "string" && body.email.trim() ? body.email.trim() : undefined,
    subscriptionType:
      typeof body.subscriptionType === "string" && body.subscriptionType.trim()
        ? body.subscriptionType.trim()
        : undefined,
  }
}
