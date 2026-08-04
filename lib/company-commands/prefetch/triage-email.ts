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

/**
 * Extracts the last bare email address found in a From-header line, fetched
 * outside the untrusted body wrapper. Mirrors the extraction
 * plh-takeshi-agent's own daemon uses on a plain From line
 * (`grep -oiE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'`, last match), so the two
 * systems agree on which address a header resolves to. Returns null rather
 * than guessing when nothing recognisable is present — an unparseable sender
 * is an unverified sender, not a probably-fine one.
 */
function extractSenderAddress(fromHeader: string): string | null {
  const matches = fromHeader.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/gi)
  if (!matches || matches.length === 0) return null
  return matches[matches.length - 1]
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

    // Cheap pre-filter only, so a search full of strangers doesn't even
    // reach the metadata round-trip below. It is NOT the authoritative
    // check — that's the metadata fetch after messageId resolution, which
    // runs on this path too, so a search-row filter that were somehow wrong
    // still can't let an unallowlisted sender through.
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

  // Authoritative allowlist check. Runs once, here, after messageId is
  // resolved — identically whether resolution came from search or was
  // supplied directly — so neither path can route around it. Fetched with a
  // metadata-only call, deliberately outside the untrusted body wrapper:
  // the decision of whether to trust the body must not be made by reading
  // the body.
  let fromHeader: string
  try {
    const result = await ctx.execFn(
      "gog",
      ["-a", "auto", ...GOG_SAFETY, "gmail", "get", messageId, "--format", "metadata", "--headers", "From", "--plain"],
      { cwd: ctx.agentRootPath }
    )
    fromHeader = result.stdout.trim()
  } catch (err) {
    return {
      ok: false,
      message: `Could not verify the sender of message ${messageId}: ${err instanceof Error ? err.message : String(err)}. Refusing rather than assuming it is allowlisted.`,
    }
  }

  const senderAddress = extractSenderAddress(fromHeader)
  if (senderAddress === null) {
    return {
      ok: false,
      message: `Could not find a recognisable email address in message ${messageId}'s From header. Refusing rather than assuming it is allowlisted.`,
    }
  }
  if (!isAllowlistedSender(senderAddress, sendersResult.senders)) {
    return {
      ok: false,
      message: `Message ${messageId}'s sender is not allowlisted. Refusing to fetch or analyse it.`,
    }
  }

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
    : `message id: ${messageId}\nfrom: ${senderAddress}\n(fetched directly by id; other headers are inside the body block below)`

  return {
    ok: true,
    text: `--- email metadata ---\n${header}\n\n--- email body (UNTRUSTED) ---\n${body}\n\n${repoContext}`,
  }
}
