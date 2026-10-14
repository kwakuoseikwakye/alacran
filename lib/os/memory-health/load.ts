import { defaultExecFile } from "@/lib/default-exec-file"
import type { ExecFileFn } from "@/lib/git-commit-file"
import { listMemoryItems } from "@/lib/os/memory-items"
import { findSources, findStale, findUnfinished, parseBlameTimes, parseThresholds } from "./checks"
import { gitReader } from "./git"
import { scoreMemoryHealth } from "./score"
import type { MemoryHealth } from "./types"

/**
 * Is this company's memory still true, as far as git can tell? Deterministic and read-only: one
 * blame, one log, one grep and the existing memory listing. Never throws; never `ok` from partial data.
 */
export async function loadMemoryHealth(
  rootPath: string,
  deps: { execFn?: ExecFileFn; now?: Date; listItems?: typeof listMemoryItems } = {}
): Promise<MemoryHealth> {
  const now = deps.now ?? new Date()
  const listItems = deps.listItems ?? listMemoryItems
  const r = gitReader(rootPath, deps.execFn)
  // listMemoryItems swallows its own git failures (returns a shorter list), so watch for them
  // here: partial data must never score. It also lacks --no-optional-locks; add it.
  const base = deps.execFn ?? defaultExecFile
  let listFailed = false
  const listExec: ExecFileFn = async (cmd, args) => {
    const a = args[0] === "-C" && !args.includes("--no-optional-locks") ? [args[0], args[1], "--no-optional-locks", ...args.slice(2)] : args
    try {
      return await base(cmd, a)
    } catch (e) {
      listFailed = true
      throw e
    }
  }
  try {
    const text = await r.profileText()
    if (text === null) return { state: "none" }
    const [blame, log, grep, items, thresholdsText] = await Promise.all([
      r.blame(),
      r.sourcesLog(),
      r.todoGrep(),
      listItems(rootPath, { limit: 500, execFn: listExec }),
      r.thresholdsText(),
    ])
    if (listFailed) return { state: "unknown" }
    const stale = findStale({ text, times: parseBlameTimes(blame), items, nowSeconds: Math.floor(now.getTime() / 1000), thresholds: parseThresholds(thresholdsText) })
    const unfinished = findUnfinished(grep, text)
    const sources = findSources(log)
    return { state: "ok", score: scoreMemoryHealth({ stale, unfinished, sources }), checkedAt: now.toISOString(), stale, unfinished, sources }
  } catch {
    return { state: "unknown" }
  }
}
