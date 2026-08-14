import { memoizedExecFile } from "./exec-memo"

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

// Memoized, not raw: `gog auth list -j` reads gog's keyring, and on macOS that
// can raise a Keychain prompt every single time. The Agents page calls this on
// every render. See lib/exec-memo.ts.
async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return memoizedExecFile(command, args)
}

type GogAuthList = { accounts?: Array<{ email?: unknown; scopes?: unknown }> }

/** An account plus the OAuth scopes it really carries. The scopes are what
 *  lets the Connect card show which Google services are actually authorized
 *  instead of assuming the default pair — see lib/google-services.ts. */
export type GoogleAccount = { email: string; scopes: string[] }

/**
 * Every Google account stored in `gog`'s own auth store — not just the one
 * `-a auto` currently resolves to. `gog` already supports multiple stored
 * accounts (`gog auth add`, `-a <email|alias|auto>` per call); this is just
 * the read side. Returns [] on any failure (gog missing, not authenticated,
 * malformed JSON) — callers treat that the same as "nothing connected yet".
 */
export async function listGoogleAccountEmails(execFn: ExecFileFn = defaultExecFile): Promise<string[]> {
  return (await listGoogleAccounts(execFn)).map((a) => a.email)
}

/** Same call, same memo, but keeps the scopes the email-only reader drops. */
export async function listGoogleAccounts(execFn: ExecFileFn = defaultExecFile): Promise<GoogleAccount[]> {
  let raw: string
  try {
    const res = await execFn("gog", ["auth", "list", "-j"])
    raw = res.stdout
  } catch {
    return []
  }

  let parsed: GogAuthList
  try {
    parsed = JSON.parse(raw) as GogAuthList
  } catch {
    return []
  }

  if (!Array.isArray(parsed.accounts)) return []
  return parsed.accounts
    .map((a) => ({
      email: typeof a.email === "string" ? a.email.trim() : "",
      scopes: Array.isArray(a.scopes) ? a.scopes.filter((s): s is string => typeof s === "string") : [],
    }))
    .filter((a) => a.email !== "")
}
