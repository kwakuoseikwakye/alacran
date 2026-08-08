import { readTriageRepos, readTriageSenders, isAllowlistedSender, extractSenderAddress } from "./triage-config"
import { buildRepoContext } from "./repo-summary"
import { fenceUntrusted, fenceNotice, newFenceNonce } from "./untrusted-fence"
import type { PrefetchContext, PrefetchExecFileFn, PrefetchResult } from "./types"

const MAX_SEARCH_RESULTS = 25

/** Every gog call carries these. The allowlist governs what may be invoked;
 *  these govern what gog will refuse regardless of invocation. */
const GOG_SAFETY = ["--readonly", "--gmail-no-send"]

type SearchRow = { id: string; date: string; from: string; subject: string; account: string }

function parseSearchRows(stdout: string, account: string): SearchRow[] {
  const lines = stdout.trim().split("\n")
  if (lines.length <= 1) return []
  return lines
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= 4)
    .map((cols) => ({ id: cols[0], date: cols[1], from: cols[2], subject: cols[3], account }))
}

/**
 * A message id alone doesn't say which of the company's accounts it lives
 * in, so an explicitly-supplied id (the search path already knows, from
 * whichever account matched) tries each configured account in turn until
 * one resolves.
 */
async function resolveMetadataAcrossAccounts(
  execFn: PrefetchExecFileFn,
  agentRootPath: string,
  accounts: string[],
  messageId: string
): Promise<{ ok: true; account: string; fromHeader: string } | { ok: false; message: string }> {
  const errors: string[] = []
  for (const account of accounts) {
    try {
      const result = await execFn(
        "gog",
        ["-a", account, ...GOG_SAFETY, "gmail", "get", messageId, "--format", "metadata", "--headers", "From", "--plain"],
        { cwd: agentRootPath }
      )
      return { ok: true, account, fromHeader: result.stdout.trim() }
    } catch (err) {
      errors.push(`${account}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return {
    ok: false,
    message: `Could not verify the sender of message ${messageId} on any configured account (${errors.join("; ")}). Refusing rather than assuming it is allowlisted.`,
  }
}

export async function buildTriageEmailPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  const sendersResult = await readTriageSenders(ctx.agentRootPath, ctx.readFileFn)
  if (!sendersResult.ok) return { ok: false, message: sendersResult.message }

  const reposResult = await readTriageRepos(ctx.agentRootPath, ctx.readFileFn)
  if (!reposResult.ok) return { ok: false, message: reposResult.message }

  const accounts = ctx.accounts && ctx.accounts.length > 0 ? ctx.accounts : ["auto"]

  const requestedId = (ctx.fieldValues.messageId ?? "").trim()
  let target: SearchRow | null = null

  if (requestedId === "") {
    const query = sendersResult.senders.map((s) => `from:${s}`).join(" OR ")
    // ponytail: accounts are searched in priority (assignment) order and the
    // first one with any allowlisted match wins the auto-pick, rather than a
    // true "most recent across every account" merge — that needs a confirmed
    // `gog --plain` date format to sort by, which isn't documented anywhere
    // reachable without running a live query against a real inbox. Upgrade:
    // parse+sort by date once that format is confirmed.
    for (const account of accounts) {
      let stdout: string
      try {
        const result = await ctx.execFn(
          "gog",
          ["-a", account, ...GOG_SAFETY, "gmail", "search", query, "--plain", "--max", String(MAX_SEARCH_RESULTS)],
          { cwd: ctx.agentRootPath }
        )
        stdout = result.stdout
      } catch (err) {
        return {
          ok: false,
          message: `Could not search Gmail with gog (account: ${account}): ${err instanceof Error ? err.message : String(err)}. Check that gog is installed and authenticated.`,
        }
      }

      // Cheap pre-filter only, so a search full of strangers doesn't even
      // reach the metadata round-trip below. It is NOT the authoritative
      // check — that's the metadata fetch after messageId resolution, which
      // runs on this path too, so a search-row filter that were somehow wrong
      // still can't let an unallowlisted sender through.
      const rows = parseSearchRows(stdout, account).filter((r) => isAllowlistedSender(r.from, sendersResult.senders))
      if (rows.length > 0) {
        target = rows[0]
        break
      }
    }
    if (target === null) {
      return {
        ok: false,
        message: "No recent message from an allowlisted sender. Nothing to triage.",
      }
    }
  }

  const messageId = requestedId === "" ? (target as SearchRow).id : requestedId

  // Authoritative allowlist check. Runs once, here, after messageId is
  // resolved — identically whether resolution came from search or was
  // supplied directly — so neither path can route around it. Fetched with a
  // metadata-only call, deliberately outside the untrusted body wrapper:
  // the decision of whether to trust the body must not be made by reading
  // the body. The search path already knows which account matched; the
  // direct-id path doesn't, so it tries each configured account in turn.
  let account: string
  let fromHeader: string
  if (target) {
    account = target.account
    try {
      const result = await ctx.execFn(
        "gog",
        ["-a", account, ...GOG_SAFETY, "gmail", "get", messageId, "--format", "metadata", "--headers", "From", "--plain"],
        { cwd: ctx.agentRootPath }
      )
      fromHeader = result.stdout.trim()
    } catch (err) {
      return {
        ok: false,
        message: `Could not verify the sender of message ${messageId}: ${err instanceof Error ? err.message : String(err)}. Refusing rather than assuming it is allowlisted.`,
      }
    }
  } else {
    const resolved = await resolveMetadataAcrossAccounts(ctx.execFn, ctx.agentRootPath, accounts, messageId)
    if (!resolved.ok) return resolved
    account = resolved.account
    fromHeader = resolved.fromHeader
  }

  const senderAddress = extractSenderAddress(fromHeader)
  if (senderAddress === null) {
    return {
      ok: false,
      message: `Could not resolve message ${messageId}'s From header to exactly one email address. Refusing rather than assuming it is allowlisted.`,
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
      ["-a", account, ...GOG_SAFETY, "gmail", "get", messageId, "--format", "full", "--wrap-untrusted"],
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

  // The trusted region carries only what the control panel resolved itself. The
  // message id qualifies; the From, Date and Subject do not — they come straight
  // off the `gog search` row or the metadata fetch, which is to say straight from
  // the sender. Putting them above the fence, under a prompt that says everything
  // inside the fence is the untrusted part, would tell the model that a payload
  // typed into the Subject line is safe to follow.
  const nonce = newFenceNonce()
  const provenance = target
    ? "resolved by searching Gmail for the most recent message from an allowlisted sender"
    : "fetched directly by the message id supplied in the form"
  const senderHeaders = target
    ? `from: ${target.from}\ndate: ${target.date}\nsubject: ${target.subject}`
    : `from: ${fromHeader}\n(no date or subject row on this path — they are in the body below if the message carried them)`

  const notice = fenceNotice(
    nonce,
    "it is one email's own From, Date and Subject headers followed by its body, all written or chosen by whoever sent the message."
  )
  const untrusted = fenceUntrusted(`${senderHeaders}\n\nbody:\n${body}`, nonce)

  return {
    ok: true,
    text: `--- email, as resolved by the control panel (this section only) ---\nmessage id: ${messageId}\naccount: ${account}\nhow: ${provenance}\nsender allowlist: matched (a From-header match, not authenticated mail — nothing here checks SPF, DKIM or DMARC)\n\n${notice}\n${untrusted}\n\n${repoContext}`,
  }
}
