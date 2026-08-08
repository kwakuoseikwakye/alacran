import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

type GogAuthList = { accounts?: Array<{ email?: unknown }> }

/**
 * Every Google account stored in `gog`'s own auth store — not just the one
 * `-a auto` currently resolves to. `gog` already supports multiple stored
 * accounts (`gog auth add`, `-a <email|alias|auto>` per call); this is just
 * the read side. Returns [] on any failure (gog missing, not authenticated,
 * malformed JSON) — callers treat that the same as "nothing connected yet".
 */
export async function listGoogleAccountEmails(execFn: ExecFileFn = defaultExecFile): Promise<string[]> {
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
    .map((a) => a.email)
    .filter((e): e is string => typeof e === "string" && e.trim() !== "")
}
