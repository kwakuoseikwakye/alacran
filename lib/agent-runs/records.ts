import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

export type RunStatus = "running" | "needs-review" | "no-changes" | "failed" | "interrupted"

/** One unattended agent run, as the app remembers it across restarts. Lives in
 *  the app's data dir, never the company repo. */
export type RunRecord = {
  id: string
  agentId: string
  title: string
  task: string
  executorId: string
  /** What `ps` should show for the process — checked before any kill, so a pid
   *  the OS has since handed to another program is never signalled. */
  binaryName: string
  status: RunStatus
  pid: number | null
  branch: string
  /** Where git keeps this worktree, recorded at start: the worktree's own
   *  `.git` file is agent-writable, so commits never read it. */
  gitDir: string
  /** The commit the run began from; the file count is measured against it. */
  baseSha: string
  worktreePath: string
  logPath: string
  startedAt: string
  endedAt: string | null
  /** Why it ended, in the user's words, when it didn't simply finish. */
  reason: string | null
  changedFiles: number
  /** The agent's own last words, for the review card. */
  summary: string | null
  /** Where the current pass's output begins in the log — 0, or the log's size
   *  when it was last sent back. A restart judges the pass by what it wrote
   *  after this, not by an earlier pass's result. */
  passOffset: number
}

const STATUSES = new Set<RunStatus>(["running", "needs-review", "no-changes", "failed", "interrupted"])

/** Write-then-rename, so a reader never sees half a record. */
export async function writeRunRecord(dir: string, record: RunRecord): Promise<void> {
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${record.id}.json`)
  await writeFile(`${file}.tmp`, JSON.stringify(record, null, 2))
  await rename(`${file}.tmp`, file)
}

export async function readRunRecords(dir: string): Promise<RunRecord[]> {
  const names = await readdir(dir).catch(() => [] as string[])
  const records: RunRecord[] = []
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    try {
      const value = JSON.parse(await readFile(path.join(dir, name), "utf-8")) as RunRecord
      if (typeof value.id === "string" && STATUSES.has(value.status)) records.push(value)
    } catch {
      // A record we can't read is skipped, not fatal: one bad file must not hide every other run.
    }
  }
  return records.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}
