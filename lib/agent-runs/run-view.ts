import type { RunStatus } from "./records"

/**
 * Files that change what runs when a tool starts: AI settings, git hooks and
 * the config that selects them. A Keep puts them in the company, so the card
 * names them — someone approving "3 files changed" should know one is a hook.
 */
const RISKY = [
  /^\.claude\//,
  /^\.mcp\.json$/,
  /^\.kiro\//,
  /^\.husky\//,
  /^\.githooks\//,
  /^lefthook\.ya?ml$/,
  /^\.pre-commit-config\.ya?ml$/,
  /^\.gitattributes$/,
  /^\.gitmodules$/,
]

export function riskyPaths(paths: string[]): string[] {
  return paths.filter((p) => RISKY.some((pattern) => pattern.test(p)))
}

/** How a Take over session's label starts ("You · Tidy pricing"): the client
 *  tells that tab from an assistant by it. */
export const TAKEOVER_PREFIX = "You · "

export type RunTone = "working" | "review" | "stopped" | "quiet" | "driving"

/** A run's status as a word and a tone — never a colour alone (spec §5). */
export function statusView(status: RunStatus, driving: boolean): { word: string; tone: RunTone } {
  if (driving) return { word: "You're driving", tone: "driving" }
  switch (status) {
    case "running":
      return { word: "Working", tone: "working" }
    case "needs-review":
      return { word: "Needs your review", tone: "review" }
    case "interrupted":
      return { word: "Interrupted", tone: "review" }
    case "failed":
      return { word: "Stopped", tone: "stopped" }
    case "no-changes":
      return { word: "No changes", tone: "quiet" }
  }
}

/** "under a minute", "4 min", "1 h 5 min". */
export function elapsed(startedAt: string, endedAt: string | null, now: number): string {
  const ms = (endedAt ? Date.parse(endedAt) : now) - Date.parse(startedAt)
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "under a minute"
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/**
 * An agent's closing message as plain sentences for the review strip. It writes
 * markdown (`**bold**`, `code`, lists, headings); the strip is prose for someone
 * who shouldn't have to read the syntax.
 */
export function plainSummary(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** A run the page saw working has stopped while nobody is looking at the
 *  window: the one moment a notification is worth sending. */
export function shouldNotify(before: RunStatus | undefined, after: RunStatus, away: boolean): boolean {
  return away && before === "running" && after !== "running"
}

/** Runs are polled while the page is visible, and while hidden only if one is
 *  still working — the poll that sees it stop is what sends the notification. */
export function shouldPollRuns(hidden: boolean, runs: { status: RunStatus }[]): boolean {
  return !hidden || runs.some((r) => r.status === "running")
}
