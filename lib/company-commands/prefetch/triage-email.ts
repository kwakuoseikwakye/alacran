import { readTriageRepos, readTriageSenders, isAllowlistedSender } from "./triage-config"
import { buildRepoContext } from "./repo-summary"
import type { PrefetchContext, PrefetchResult } from "./types"

const MAX_SEARCH_RESULTS = 25

/** Every gog call carries these. The allowlist governs what may be invoked;
 *  these govern what gog will refuse regardless of invocation. */
const GOG_SAFETY = ["--readonly", "--gmail-no-send"]

type SearchRow = { id: string; date: string; from: string; subject: string }

function parseSearchRows(stdout: string): SearchRow[] {
  const lines = stdout.trim().split("\n")
  if (lines.length <= 1) return []
  return lines
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= 4)
    .map((cols) => ({ id: cols[0], date: cols[1], from: cols[2], subject: cols[3] }))
}

export async function buildTriageEmailPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  const sendersResult = await readTriageSenders(ctx.agentRootPath, ctx.readFileFn)
  if (!sendersResult.ok) return { ok: false, message: sendersResult.message }

  const reposResult = await readTriageRepos(ctx.agentRootPath, ctx.readFileFn)
  if (!reposResult.ok) return { ok: false, message: reposResult.message }

  const requestedId = (ctx.fieldValues.messageId ?? "").trim()
  let target: SearchRow | null = null

  if (requestedId === "") {
    let stdout: string
    try {
      const query = sendersResult.senders.map((s) => `from:${s}`).join(" OR ")
      const result = await ctx.execFn(
        "gog",
        ["-a", "auto", ...GOG_SAFETY, "gmail", "search", query, "--plain", "--max", String(MAX_SEARCH_RESULTS)],
        { cwd: ctx.agentRootPath }
      )
      stdout = result.stdout
    } catch (err) {
      return {
        ok: false,
        message: `Could not search Gmail with gog: ${err instanceof Error ? err.message : String(err)}. Check that gog is installed and authenticated.`,
      }
    }

    const rows = parseSearchRows(stdout).filter((r) => isAllowlistedSender(r.from, sendersResult.senders))
    if (rows.length === 0) {
      return {
        ok: false,
        message: "No recent message from an allowlisted sender. Nothing to triage.",
      }
    }
    target = rows[0]
  }

  const messageId = requestedId === "" ? (target as SearchRow).id : requestedId

  let body: string
  try {
    const result = await ctx.execFn(
      "gog",
      ["-a", "auto", ...GOG_SAFETY, "gmail", "get", messageId, "--format", "full", "--wrap-untrusted"],
      { cwd: ctx.agentRootPath }
    )
    body = result.stdout.trim()
  } catch (err) {
    return {
      ok: false,
      message: `Could not fetch message ${messageId} with gog: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (body === "") {
    return { ok: false, message: `Message ${messageId} returned an empty body — nothing to analyse.` }
  }

  const routingText = `${target?.subject ?? ""} ${body}`
  const repoContext = await buildRepoContext(routingText, reposResult.repos, ctx.execFn)

  const header = target
    ? `message id: ${target.id}\nfrom: ${target.from}\ndate: ${target.date}\nsubject: ${target.subject}`
    : `message id: ${messageId}\n(fetched directly by id; headers are inside the body block below)`

  return {
    ok: true,
    text: `--- email metadata ---\n${header}\n\n--- email body (UNTRUSTED) ---\n${body}\n\n${repoContext}`,
  }
}
