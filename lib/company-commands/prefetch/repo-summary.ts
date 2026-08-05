import type { TriageRepo } from "./triage-config"
import type { PrefetchExecFileFn } from "./types"

const MAX_FILES = 200
const MIN_KEYWORD_LENGTH = 5

/**
 * Deliberately dumb keyword matching. The agent, not this function, is the thing
 * that can reason about which repo a request concerns — so the job here is to
 * avoid *foreclosing* on the right answer, not to be clever. Short and generic
 * words are dropped so a description like "Mobile app" doesn't match every
 * message containing "app".
 */
export function matchRepos(text: string, repos: TriageRepo[]): TriageRepo[] {
  const haystack = text.toLowerCase()
  return repos.filter((repo) => {
    if (haystack.includes(repo.name.toLowerCase())) return true
    const words = repo.description
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((w) => w.length >= MIN_KEYWORD_LENGTH)
    return words.some((w) => haystack.includes(w))
  })
}

async function run(
  execFn: PrefetchExecFileFn,
  cwd: string,
  args: string[]
): Promise<string> {
  const { stdout } = await execFn("git", args, { cwd })
  return stdout.trim()
}

export async function summariseRepo(
  repo: TriageRepo,
  execFn: PrefetchExecFileFn,
  includeFileList: boolean
): Promise<string> {
  try {
    const branch = await run(execFn, repo.path, ["rev-parse", "--abbrev-ref", "HEAD"])
    const status = await run(execFn, repo.path, ["status", "--short"])
    const log = await run(execFn, repo.path, ["log", "--oneline", "-20"])

    // Branch and dirty state are load-bearing: several real repos are mid-work,
    // so an analysis that assumes a clean tree reasons about a state that
    // doesn't exist.
    const dirtyCount = status === "" ? 0 : status.split("\n").length
    const treeState =
      dirtyCount === 0
        ? "clean"
        : `${dirtyCount} file(s) with uncommitted changes — this is work in progress, not a settled tree`

    let files = ""
    if (includeFileList) {
      const all = await run(execFn, repo.path, ["ls-files"])
      const list = all === "" ? [] : all.split("\n")
      const shown = list.slice(0, MAX_FILES)
      const truncated = list.length > shown.length ? `\n(… ${list.length - shown.length} more)` : ""
      files = `\ntracked files (first ${MAX_FILES}):\n${shown.join("\n")}${truncated}`
    }

    return `${repo.name} — ${repo.description}
path: ${repo.path}
branch: ${branch}
working tree: ${treeState}
recent commits:
${log || "(none)"}${files}`
  } catch (err) {
    return `${repo.name} — ${repo.description}
path: ${repo.path}
(unable to read this repo: ${err instanceof Error ? err.message : String(err)})`
  }
}

export async function buildRepoContext(
  text: string,
  repos: TriageRepo[],
  execFn: PrefetchExecFileFn
): Promise<string> {
  const matched = matchRepos(text, repos)

  if (matched.length === 1) {
    const summary = await summariseRepo(matched[0], execFn, true)
    return `--- repo context (routed to ${matched[0].name} by keyword match) ---\n${summary}\n\nThis routing is a dumb keyword match, not a judgement. If the request clearly concerns a different repo, say so and state your own routing confidence.`
  }

  const summaries: string[] = []
  for (const repo of repos) {
    summaries.push(await summariseRepo(repo, execFn, false))
  }
  return `--- repo context (could not be routed confidently — ${matched.length} keyword matches) ---\n${summaries.join("\n\n")}\n\nState which repo you believe this concerns and how confident you are. Do not guess silently.`
}
