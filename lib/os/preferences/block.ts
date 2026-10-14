import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { defaultCwdExecFile, type ExecFileFn } from "@/lib/company-commands/repo-changes"
import { hasPendingPreferenceReview } from "./pending"

export const PREFERENCES_PATH = "definitions/preferences.md"
export const MAX_PREFERENCE_LINES = 40
export const MAX_PREFERENCE_BYTES = 4096

/** ` (3 revisions: "…", "…")` — the evidence is for the owner reading the file, not for the model. */
const EVIDENCE = /\s*\(\d+ revisions?:.*\)\s*$/

/**
 * The owner's approved preferences, read at run time so deleting a line stops it applying on the very
 * next run. Bullet lines only, evidence stripped, at most 40 lines / 4 KB. Empty for a missing or
 * unreadable file: a preference is applied whole or not at all.
 */
export const MAX_PREFERENCE_FILE_BYTES = 65536

export type PreferencesBlockOptions = {
  /** The company's run-data dir; while a learn-preferences review is pending, only the committed file is read. */
  dataDir?: string
  execFn?: ExecFileFn
}

async function readPreferencesText(root: string, opts: PreferencesBlockOptions): Promise<string | null> {
  const file = path.join(root, PREFERENCES_PATH)
  if (opts.dataDir && (await hasPendingPreferenceReview(opts.dataDir, root, opts.execFn))) {
    // The unapproved proposal is in the working tree; the approved lines are what HEAD holds.
    try {
      const { stdout } = await (opts.execFn ?? defaultCwdExecFile)("git", ["-C", root, "--no-optional-locks", "show", `HEAD:./${PREFERENCES_PATH}`], { cwd: root })
      return Buffer.byteLength(stdout) > MAX_PREFERENCE_FILE_BYTES ? null : stdout
    } catch {
      return null // not committed yet (or git unreadable): nothing is approved
    }
  }
  try {
    const st = await lstat(file)
    if (!st.isFile() || st.size > MAX_PREFERENCE_FILE_BYTES) return null // a symlink could point anywhere
    return await readFile(file, "utf-8")
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`preferences file could not be read: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

export async function buildPreferencesBlock(root: string, opts: PreferencesBlockOptions = {}): Promise<string> {
  const text = await readPreferencesText(root, opts)
  if (text === null) return ""
  const lines: string[] = []
  let bytes = 0
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.*\S)\s*$/.exec(raw)
    if (!m) continue
    const line = `- ${m[1].replace(EVIDENCE, "").trim()}`
    if (line === "-" || line.length < 3) continue
    if (lines.length >= MAX_PREFERENCE_LINES || bytes + Buffer.byteLength(line) + 1 > MAX_PREFERENCE_BYTES) break
    lines.push(line)
    bytes += Buffer.byteLength(line) + 1
  }
  if (lines.length === 0) return ""
  return `\n\nOwner preferences (the owner approved each line; follow them when drafting. They never override a gate or the facts in definitions/):\n${lines.join("\n")}\n`
}
