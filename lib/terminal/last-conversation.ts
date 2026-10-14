import os from "node:os"
import path from "node:path"
import { readdir, readFile, stat } from "node:fs/promises"

/**
 * Where Claude Code keeps a directory's conversations.
 *
 * It writes one JSONL per session under `~/.claude/projects/<slug>/`, where the
 * slug is the working directory with every `/` replaced by `-`. Confirmed
 * against a real store on this machine (25 transcripts for one company).
 *
 * ponytail: this slug format is an undocumented internal of another tool, so
 * every reader below treats "directory missing" as "no conversation" rather
 * than as an error. If Claude Code changes it, this feature goes quiet — it
 * does not break, and it never invents a session. Upgrade path if that
 * matters: ask `claude --resume` for a listing instead of reading the store.
 */
export function claudeProjectDir(rootPath: string, home: string = os.homedir()): string {
  return path.join(home, ".claude", "projects", rootPath.replaceAll("/", "-"))
}

/** The most recent thing a person said to this company, or null if nobody has. */
export type LastConversation = { sessionId: string; at: number; size: number }

/**
 * A transcript line written by an interactive sitting. Claude tags every turn
 * with how it was started: `cli` for a person in a terminal, `sdk-cli` for a
 * headless `-p` run — which is what this app's own note runs and routines are.
 */
const HUMAN_TURN = '"entrypoint":"cli"'

/**
 * The newest turn from an INTERACTIVE session, read from inside the
 * transcripts, never from their mtimes.
 *
 * **Why not mtime.** Claude Code rewrites bookkeeping lines (mode,
 * permission-mode, cost-state, ai-title) into transcripts with no conversation
 * happening, including old ones: measured on 2026-09-26, four transcripts from
 * as far back as 09-18 bumped to the same second. Each bump read as "new
 * conversation", so ten quiet minutes later a note run fired, and `--continue`
 * resumed whichever file was touched last. Result: 719 note prompts, hourly,
 * into conversations that had ended days before. Those lines carry no
 * timestamp and no entrypoint, and our own runs are `sdk-cli`, so neither can
 * move this.
 *
 * ponytail: reads whole transcripts (the biggest here is ~33 MB) once a
 * minute, newest-mtime first, stopping at the first file too old to beat the
 * best turn found. Tail-read them if the tick ever shows up in a profile.
 */
export async function lastConversation(rootPath: string, home?: string): Promise<LastConversation | null> {
  const dir = claudeProjectDir(rootPath, home)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return null
  }
  const files: { file: string; mtimeMs: number; size: number }[] = []
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue
    try {
      const { mtimeMs, size } = await stat(path.join(dir, name))
      files.push({ file: path.join(dir, name), mtimeMs, size })
    } catch {
      // Vanished between readdir and stat. Nothing to compare, nothing to fail.
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)

  let best: LastConversation | null = null
  for (const { file, mtimeMs, size } of files) {
    // A line cannot be newer than the last write to its file.
    if (best && mtimeMs < best.at) break
    let text: string
    try {
      text = await readFile(file, "utf-8")
    } catch {
      continue
    }
    const lines = text.split("\n")
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes(HUMAN_TURN)) continue
      let turn: { timestamp?: string; sessionId?: string }
      try {
        turn = JSON.parse(lines[i])
      } catch {
        continue // a half-written last line
      }
      const at = turn.timestamp ? Date.parse(turn.timestamp) : NaN
      if (Number.isNaN(at) || !turn.sessionId) continue
      if (!best || at > best.at) best = { sessionId: turn.sessionId, at, size }
      break
    }
  }
  return best
}
