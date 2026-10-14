import type { PrefetchContext, PrefetchResult } from "./types"

/** Every call carries `--no-optional-locks`: plain `git status` rewrites .git/index and can fail an agent's `git add` (AGENTS.md). */
const GIT = "--no-optional-locks"
const MAX_LINES = 80

function clip(text: string, empty: string): string {
  const lines = text.split("\n").map((l) => l.trimEnd()).filter(Boolean)
  if (lines.length === 0) return empty
  return lines.length > MAX_LINES ? `${lines.slice(0, MAX_LINES).join("\n")}\n… [${lines.length - MAX_LINES} more lines]` : lines.join("\n")
}

/**
 * The state of play for `/handoff`. The run has no Bash, so the control panel gathers what the
 * command's template tells the agent to run: the working tree, the diff size, and the decisions
 * recorded since HANDOFF.md last changed. Every source fails soft into a plain line, because an
 * unreadable git is something to write down, not a reason to refuse.
 */
export async function buildHandoffPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  const git = async (args: string[], empty: string): Promise<string> => {
    try {
      const { stdout } = await ctx.execFn("git", [GIT, ...args], { cwd: ctx.agentRootPath })
      return clip(stdout, empty)
    } catch (err) {
      return `(unable to read git: ${err instanceof Error ? err.message : String(err)})`
    }
  }

  const status = await git(["status", "--short"], "(the working tree is clean)")
  const stat = await git(["diff", "--stat"], "(no uncommitted changes to tracked files)")

  let since = ""
  let historyUnreadable = false
  try {
    const { stdout } = await ctx.execFn("git", [GIT, "log", "-1", "--format=%H", "--", "HANDOFF.md"], { cwd: ctx.agentRootPath })
    since = stdout.trim()
  } catch {
    // Not the same as "never committed": say which one it was, so the list below is not misread.
    historyUnreadable = true
  }
  const decisionsHeading = since
    ? "since HANDOFF.md last changed"
    : historyUnreadable
      ? "(couldn't read HANDOFF.md's history, so all of them)"
      : "(HANDOFF.md has no history, so all of them)"
  const decisions = await git(
    since
      ? ["diff", "--name-only", "--diff-filter=A", `${since}..HEAD`, "--", "docs/decisions"]
      : ["log", "--name-only", "--diff-filter=A", "--pretty=format:", "--", "docs/decisions"],
    "(no new decisions recorded)"
  )

  return {
    ok: true,
    text: [
      "--- working tree (git status --short) ---",
      status,
      "",
      "--- uncommitted changes to tracked files (git diff --stat) ---",
      stat,
      "",
      `--- decisions added ${decisionsHeading} ---`,
      decisions,
    ].join("\n"),
  }
}
