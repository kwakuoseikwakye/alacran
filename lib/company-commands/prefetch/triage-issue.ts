import { readTriageRepos } from "./triage-config"
import { buildRepoContext } from "./repo-summary"
import { fenceUntrusted, fenceNotice, newFenceNonce } from "./untrusted-fence"
import type { PrefetchContext, PrefetchResult } from "./types"

/**
 * Strict shape validation, not sanitisation. The value reaches an argv token, so
 * anything that isn't exactly `owner/repo#123` or the equivalent URL is rejected
 * outright rather than cleaned up — the same reasoning v6 applied to its `sha`
 * parameter after a real argv-injection bug.
 */
export function parseIssueRef(raw: string): { repo: string; number: string } | null {
  const value = raw.trim()
  if (value === "") return null

  const url = /^https:\/\/github\.com\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/issues\/(\d+)$/.exec(value)
  if (url) return { repo: url[1], number: url[2] }

  const short = /^([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)#(\d+)$/.exec(value)
  if (short) return { repo: short[1], number: short[2] }

  return null
}

export async function buildTriageIssuePrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  const ref = parseIssueRef(ctx.fieldValues.issue ?? "")
  if (!ref) {
    return {
      ok: false,
      message: 'Could not read that issue reference. Use owner/repo#123 or a full https://github.com/owner/repo/issues/123 URL.',
    }
  }

  const reposResult = await readTriageRepos(ctx.agentRootPath, ctx.readFileFn)
  if (!reposResult.ok) return { ok: false, message: reposResult.message }

  let issueText: string
  try {
    const { stdout } = await ctx.execFn(
      "gh",
      ["issue", "view", ref.number, "--repo", ref.repo, "--json", "title,body,state,labels,author,createdAt"],
      { cwd: ctx.agentRootPath }
    )
    issueText = stdout.trim()
  } catch (err) {
    return {
      ok: false,
      message: `Could not read ${ref.repo}#${ref.number} with gh: ${err instanceof Error ? err.message : String(err)}. Check that gh is installed and authenticated.`,
    }
  }

  if (issueText === "") {
    return { ok: false, message: `${ref.repo}#${ref.number} returned nothing — check the reference.` }
  }

  const repoContext = await buildRepoContext(`${ref.repo} ${issueText}`, reposResult.repos, ctx.execFn)

  // The reference itself came from the operator through parseIssueRef's strict shape
  // validation, so it belongs in the trusted region. Every byte `gh` returned does
  // not: the title, body, labels and author name are all written by whoever filed
  // the issue, and that is a far wider trust boundary than triage-email's allowlist.
  const nonce = newFenceNonce()
  const notice = fenceNotice(
    nonce,
    `it is the JSON gh returned for ${ref.repo}#${ref.number} — title, body, labels and author, all written or chosen by whoever filed the issue.`
  )

  return {
    ok: true,
    text: `--- github issue, as resolved by the control panel (this section only) ---\nreference: ${ref.repo}#${ref.number}\nhow: gh issue view, read-only, on the reference supplied in the form\n\n${notice}\n${fenceUntrusted(issueText, nonce)}\n\n${repoContext}`,
  }
}
