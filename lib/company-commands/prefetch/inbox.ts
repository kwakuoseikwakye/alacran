import { listGoogleAccounts } from "../../google-accounts"
import { readGoogleAccounts } from "../../google-accounts-config"
import type { PrefetchContext, PrefetchResult } from "./types"
import { fenceNotice, fenceUntrusted, newFenceNonce } from "./untrusted-fence"

/** One page per account; an inbox that overruns this is more than one summary can use. */
const MAX_PER_ACCOUNT = 20
/** At most this many accounts in one run. */
const MAX_ACCOUNTS = 3
const MAX_FIELD = 200

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > MAX_FIELD ? `${flat.slice(0, MAX_FIELD)}… [truncated]` : flat
}

/**
 * Fixed sentences only. gog's own error text can carry the command line and its stderr, and a
 * refusal is shown to the owner (and may be spoken aloud), so none of it is passed through.
 */
function searchFailure(account: string, err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return /ENOENT|command not found/i.test(raw)
    ? "The Google tool (gog) isn't installed. Install it from Alacrán's Connect page, then try again."
    : `Could not read the inbox for ${account}. Check that Google is still connected, then try again.`
}

/**
 * Unread mail for the connected Google account(s), read through `gog`.
 *
 * Header-only on purpose: the search rows carry date, sender and subject, and no body is ever
 * fetched, so the most an outsider can put in front of the agent is a subject line. That is
 * still text written by people outside the company, so the whole payload is fenced and the
 * command is `untrustedInput`. Refuses (spawning no agent) when nothing is connected, when the
 * accounts the company chose are not connected, or when nothing is unread.
 *
 * Which accounts: the ones the company chose in `definitions/integrations/google.yaml`, and only
 * those. A chosen list that no longer matches anything connected is a refusal, never a quiet
 * fallback to every connected account: that could read a different (personal) inbox into the
 * company's notes. Only a company that chose nothing gets every connected account.
 */
export async function buildInboxPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  const exec = (file: string, args: string[]) => ctx.execFn(file, args, { cwd: ctx.agentRootPath })

  // Never throws: any failure (gog missing, not signed in, bad JSON) comes back as [].
  const connected = (await listGoogleAccounts(exec)).map((a) => a.email)
  if (connected.length === 0) {
    return { ok: false, message: "No Google account is connected. Connect a Google account on the Connect page, then try again." }
  }

  const chosen = await readGoogleAccounts(ctx.agentRootPath, ctx.readFileFn)
  let accounts = connected
  if (chosen.length > 0) {
    // Compare ignoring case, but search with gog's own spelling of the address.
    const wanted = new Set(chosen.map((a) => a.toLowerCase()))
    accounts = connected.filter((c) => wanted.has(c.toLowerCase()))
    if (accounts.length === 0) {
      return { ok: false, message: "The inbox accounts chosen for this company aren't connected. Connect them on the Connect page, then try again." }
    }
  }
  accounts = accounts.slice(0, MAX_ACCOUNTS)

  const sections: string[] = []
  let total = 0
  for (const account of accounts) {
    let stdout: string
    try {
      ;({ stdout } = await exec("gog", ["-a", account, "gmail", "search", "is:unread", "--plain", "--max", String(MAX_PER_ACCOUNT)]))
    } catch (err) {
      return { ok: false, message: searchFailure(account, err) }
    }
    // First line is the header; rows are tab-separated: ID, DATE, FROM, SUBJECT, LABELS, THREAD.
    // The slice keeps the cap ours, whether or not gog honours --max.
    const rows = stdout
      .split("\n")
      .slice(1)
      .filter((l) => l.trim() !== "")
      .slice(0, MAX_PER_ACCOUNT)
    if (rows.length === 0) continue
    total += rows.length
    const lines = rows.map((row) => {
      const [, date = "", from = "", subject = ""] = row.split("\t")
      return `- [${oneLine(date)}] ${oneLine(from)}: ${oneLine(subject) || "(no subject)"}`
    })
    // "latest", not a count of everything unread: the search is capped, so the true total is unknown.
    sections.push(`--- ${account} (showing the latest ${rows.length} unread) ---\n${lines.join("\n")}`)
  }

  if (total === 0) {
    return { ok: false, message: "No unread mail in the connected account(s) — nothing to write up." }
  }

  const nonce = newFenceNonce()
  return {
    ok: true,
    text:
      `${fenceNotice(nonce, "email headers (date, sender, subject) written by whoever can email this company.")}\n` +
      fenceUntrusted(sections.join("\n\n"), nonce),
  }
}
