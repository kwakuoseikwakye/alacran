import { buildCheckNotionPrefetch } from "./check-notion"
import { fenceNotice, fenceUntrusted, newFenceNonce } from "./untrusted-fence"
import type { PrefetchContext, PrefetchResult } from "./types"

const ONTOLOGY_PATH = "definitions/ontology/company.yaml"

/** Enough to see a month of drift without turning the prompt into a git dump.
 *  The agent has Read/Grep/Glob on the whole repo and can go look for itself —
 *  this list only has to tell it WHERE. */
const MAX_COMMITS = 50

/** How far back to look when the ontology has never been committed, so there
 *  is no "since" commit to diff against. */
const FALLBACK_WINDOW = "90 days ago"

/**
 * What has changed about this company since its ontology was last written.
 *
 * Two sources, and the split matters. The repo's own git history is the
 * signal that needs no connector at all — notes, decisions and retros the
 * user has been accumulating are exactly the evidence that a company.yaml
 * written months ago is now wrong. Notion is added when it happens to be
 * connected, because the agent has no credentials and no Bash in this run and
 * therefore cannot reach it itself.
 *
 * Unlike `check-notion`, a missing Notion connection is NOT a refusal here.
 * Refresh's whole point is that it works on a fresh machine with nothing
 * plugged in; a company with no connectors still has its own repo to learn
 * from. Only a total absence of both signals is worth aborting for, and that
 * cannot happen — git either answers or says why it couldn't.
 */
export async function buildRefreshPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  const sections: string[] = []

  // The commit that last touched the ontology is the real "as of" date for
  // everything in it — far better than a wall-clock window, which would
  // re-show the same commits every day for a company nobody has updated.
  let since: string | null = null
  try {
    const { stdout } = await ctx.execFn("git", ["log", "-1", "--format=%H", "--", ONTOLOGY_PATH], {
      cwd: ctx.agentRootPath,
    })
    since = stdout.trim() || null
  } catch {
    since = null
  }

  const range = since ? [`${since}..HEAD`] : ["--since", FALLBACK_WINDOW]
  const scope = since
    ? `since the ontology was last committed (${since.slice(0, 7)})`
    : `from the last ${FALLBACK_WINDOW} (the ontology has never been committed, so there is no "since" to diff against)`

  let history: string
  try {
    const { stdout } = await ctx.execFn("git", ["log", ...range, "--oneline", "-n", String(MAX_COMMITS)], {
      cwd: ctx.agentRootPath,
    })
    history = stdout.trim() || "(nothing has been committed in this repo since then)"
  } catch (err) {
    history = `(unable to read git log: ${err instanceof Error ? err.message : String(err)})`
  }
  sections.push(`--- this company's own commits, ${scope} ---\n${history}`)

  let files: string
  try {
    const args = since
      ? ["diff", "--name-only", `${since}..HEAD`]
      : ["log", "--since", FALLBACK_WINDOW, "--name-only", "--pretty=format:"]
    const { stdout } = await ctx.execFn("git", args, { cwd: ctx.agentRootPath })
    const unique = [...new Set(stdout.split("\n").map((l) => l.trim()).filter(Boolean))].sort()
    files = unique.length > 0 ? unique.join("\n") : "(no files changed)"
  } catch {
    files = "(unable to list changed files)"
  }
  sections.push(`--- files touched in that range (read the interesting ones yourself) ---\n${files}`)

  // Fail-soft, deliberately: no Notion connection is the normal case, not an
  // error. buildCheckNotionPrefetch refuses with a message explaining how to
  // connect, which is exactly the right note to hand the agent — so its
  // refusal is downgraded to a line rather than propagated.
  const notion = await buildCheckNotionPrefetch(ctx)
  if (!notion.ok) {
    sections.push(`--- Notion ---\n(not connected for this company, so nothing was fetched: ${notion.message})`)
  } else {
    // check-notion's own prompt only ever asks the agent to LIST these, so it
    // ships them unfenced. Refresh asks the agent to act on them — to change a
    // file — which makes a page title a real injection surface, so the fence
    // this repo already uses for email and issue bodies goes on here too.
    const nonce = newFenceNonce()
    sections.push(
      `--- Notion ---\n${fenceNotice(nonce, "page and database titles written by whoever has access to that workspace.")}\n` +
        fenceUntrusted(notion.text, nonce)
    )
  }

  return { ok: true, text: sections.join("\n\n") }
}
