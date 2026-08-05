import type { PrefetchContext, PrefetchResult } from "./types"

/**
 * The original v8 prefetch, extracted unchanged. Both branches degrade to a
 * parenthesised note rather than refusing: `handoff` is still useful without
 * git history or issues, unlike the triage commands.
 */
export async function buildRepoStatusPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  let gitLog: string
  try {
    const { stdout } = await ctx.execFn("git", ["log", "--since=24 hours ago", "--oneline"], {
      cwd: ctx.agentRootPath,
    })
    gitLog = stdout.trim() || "(no commits in the last 24 hours)"
  } catch (err) {
    gitLog = `(unable to read git log: ${err instanceof Error ? err.message : String(err)})`
  }

  let issues: string
  try {
    const { stdout } = await ctx.execFn("gh", ["issue", "list", "--state", "open", "--limit", "10"], {
      cwd: ctx.agentRootPath,
    })
    issues = stdout.trim() || "(no open issues)"
  } catch {
    issues = "(gh unavailable or not authenticated — issue status not confirmed this run)"
  }

  return {
    ok: true,
    text: `--- git log (last 24 hours) ---\n${gitLog}\n\n--- open issues (gh issue list, up to 10) ---\n${issues}`,
  }
}
