import type { PrefetchContext, PrefetchExecFileFn, PrefetchResult } from "./types"
import { fenceNotice, fenceUntrusted, newFenceNonce } from "./untrusted-fence"

/**
 * What the company's chats said today — every network at once, read through
 * the Beeper CLI and handed to a scoped agent that has no credentials and no
 * Bash.
 *
 * This used to be two connectors, Telegram and Slack, each with its own bot
 * token in the company's `.env`, its own API shape and its own setup
 * instructions — and each covering exactly one network. Beeper Desktop already
 * bridges the rest (WhatsApp, iMessage, Signal, Instagram, Messenger, X,
 * Discord, LinkedIn, Google Messages, and Telegram and Slack too), so one
 * connection replaces both and adds the ten this app was never going to write
 * a connector for. Meta's webhook-only problem, which is why Instagram was
 * previously impossible here, is Beeper's problem now and it has solved it.
 *
 * Three properties came free with going through the CLI rather than talking to
 * Beeper Desktop's HTTP API directly:
 *
 * 1. **No credential anywhere in the company.** `beeper setup` adopts Beeper
 *    Desktop's own local session and the CLI keeps it, so there is no token in
 *    `.env` to leak and revoking happens in Beeper. The two bot tokens this
 *    replaced both lived in the repo.
 * 2. **Read-only is enforced, not merely chosen.** `--read-only` makes the CLI
 *    reject every mutating command, so this cannot send a message even if the
 *    args were wrong. Picking a read endpoint by hand only ever meant "I
 *    intended not to write."
 * 3. **`--sender others` drops the company's own outbound messages** at the
 *    source rather than in a filter here.
 *
 * Still strictly read-only and pull-only, and now not even outbound: the CLI
 * talks to Beeper Desktop on loopback, so the messages never leave the machine
 * to reach this app.
 *
 * Every message body here is written by people outside the company, so the
 * whole payload goes inside the nonced fence and the command carries
 * `untrustedInput: true` — which costs it Bash, pins it to an executor that
 * can enforce an edit scope, and bars it from auto-commit.
 */

/**
 * ponytail: a fixed 24-hour window, not a since-last-run cursor. Matches the
 * intended use — one scheduled run a day — and a cursor means state on disk
 * that a missed day silently skips past. `--after` takes any ISO instant, so
 * widen this if someone wants a laptop that was shut for a week to catch up.
 */
const LOOKBACK_HOURS = 24
/** One page, every network. A day of chat that overruns this is more than one
 *  note can usefully summarise anyway. */
const MESSAGE_LIMIT = 200
/** Long enough for a real message, short enough that 200 of them still leave
 *  the agent room to think. Truncation is marked, never silent. */
const MAX_TEXT = 500
/** Beeper Desktop is local, so a slow answer means it is starting up or wedged,
 *  not that the network is far away. */
const CLI_TIMEOUT = "60s"

function oneLine(text: unknown): string {
  if (typeof text !== "string") return ""
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT)}… [truncated]` : flat
}

function hhmm(timestamp: unknown): string {
  const at = typeof timestamp === "string" ? new Date(timestamp) : new Date(NaN)
  return Number.isNaN(at.getTime()) ? "unknown time" : at.toISOString().slice(0, 16).replace("T", " ")
}

type BeeperMessage = { text?: unknown; senderName?: unknown; timestamp?: unknown; chatID?: unknown }
type BeeperChat = { id?: unknown; title?: unknown; network?: unknown }

/**
 * Every `beeper` command answers `--json` with the same envelope:
 * `{ success, data, error }`, `data` being the command's own result. A non-zero
 * exit throws out of execFn before this runs, so a parse failure here means the
 * CLI printed something that wasn't the envelope at all.
 */
function envelopeData(stdout: string): unknown {
  const parsed = JSON.parse(stdout) as { success?: boolean; data?: unknown; error?: unknown }
  if (parsed.success !== true) {
    throw new Error(typeof parsed.error === "string" ? parsed.error : "the Beeper CLI reported a failure")
  }
  return parsed.data
}

/**
 * `--read-only` on every call, `-q` so a spinner never lands in the JSON, and
 * `--timeout` so a wedged Beeper Desktop can't hold a scheduled run open.
 *
 * cwd is the company's own root only because PrefetchExecFileFn requires one;
 * the CLI reads its session from the user's own config, not from here.
 */
async function beeper(execFn: PrefetchExecFileFn, cwd: string, args: string[]): Promise<unknown> {
  const { stdout } = await execFn("beeper", [...args, "--json", "--read-only", "-q", "--timeout", CLI_TIMEOUT], { cwd })
  return envelopeData(stdout)
}

/**
 * A message knows its `chatID` but not what that chat is called or which
 * network it is on, so the chat list is what turns `!abc123:beeper.local` into
 * `[WhatsApp/Family]`. One extra call, and a chat missing from it still yields
 * a usable line rather than dropping the message.
 */
async function chatLabels(execFn: PrefetchExecFileFn, cwd: string): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const data = await beeper(execFn, cwd, ["chats", "list", "--limit", String(MESSAGE_LIMIT)])
  for (const chat of Array.isArray(data) ? (data as BeeperChat[]) : []) {
    if (typeof chat.id !== "string") continue
    const network = typeof chat.network === "string" && chat.network ? chat.network : "chat"
    const title = typeof chat.title === "string" && chat.title ? chat.title : "unknown chat"
    labels.set(chat.id, `${network}/${title}`)
  }
  return labels
}

async function beeperLines(execFn: PrefetchExecFileFn, cwd: string, since: Date): Promise<string[]> {
  // The chat list is a nicety; the messages are the point. A failure to label
  // must not lose the day's messages.
  const labels = await chatLabels(execFn, cwd).catch(() => new Map<string, string>())
  const data = await beeper(execFn, cwd, [
    "messages",
    "search",
    "--after",
    since.toISOString(),
    "--limit",
    String(MESSAGE_LIMIT),
    // Server-side, so the company's own outbound messages never arrive to be
    // filtered out here.
    "--sender",
    "others",
    // Otherwise every id and body is elided for terminal width, mid-sentence.
    "--full",
  ])

  return (Array.isArray(data) ? (data as BeeperMessage[]) : []).flatMap((m) => {
    const text = oneLine(m.text)
    if (!text) return []
    const where = (typeof m.chatID === "string" && labels.get(m.chatID)) || "chat/unknown chat"
    const who = typeof m.senderName === "string" && m.senderName ? m.senderName : "someone"
    return [`- [${where}] ${who} at ${hhmm(m.timestamp)}: ${text}`]
  })
}

/**
 * The CLI says what is wrong far better than a wrapper can guess, so its own
 * stderr is passed through — but the two failures a user actually hits are
 * named, because both otherwise read as "you had a quiet day."
 */
function explain(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/ENOENT|not found/i.test(raw)) {
    return "the Beeper CLI isn't installed — install it from Alacrán's Connect page, or with `npm install -g beeper-cli`"
  }
  if (/unauthorized|401|no target|unreachable/i.test(raw)) {
    return "Beeper isn't connected — run `beeper setup` with Beeper Desktop running, then try again"
  }
  return raw
}

export async function buildMessagesPrefetch(ctx: PrefetchContext): Promise<PrefetchResult> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000)

  let section: string
  try {
    const lines = await beeperLines(ctx.execFn, ctx.agentRootPath, since)
    // Refuse rather than spawn when there is provably nothing to summarise. An
    // agent asked to write up an empty day is an API call spent to produce
    // "no messages" — and unlike `refresh`, this command has no repo history
    // to fall back on.
    if (lines.length === 0) {
      return {
        ok: false,
        message: `No messages on any connected network in the last ${LOOKBACK_HOURS} hours — nothing to write up.`,
      }
    }
    section = lines.join("\n")
  } catch (err) {
    // A broken connection is a refusal, not a note saying the connection is
    // broken: the note would be committed and then read later as a record of a
    // quiet day.
    return { ok: false, message: `Could not read this company's chats: ${explain(err)}` }
  }

  const nonce = newFenceNonce()
  return {
    ok: true,
    text:
      `${fenceNotice(nonce, "chat messages written by whoever can message this company on any network connected to Beeper.")}\n` +
      fenceUntrusted(`--- Beeper, last ${LOOKBACK_HOURS}h, all connected networks ---\n${section}`, nonce),
  }
}
