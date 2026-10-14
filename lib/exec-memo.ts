import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(nodeExecFile)

export type ExecResult = { stdout: string; stderr: string }

/**
 * Process-wide memo for the read-only probes this dashboard re-runs on EVERY
 * page render (`which gog`, `gog auth list -j`, `gog auth status -j`,
 * `gh api user`). Every page is `force-dynamic`, so before this each render —
 * Agents, Network, Connect, the Ownership sheet, and OnboardingWelcome's
 * refresh-on-window-focus — spawned them again.
 *
 * The cost is not CPU, it's a macOS dialog. Homebrew ships `gog` ad-hoc /
 * linker-signed, so its code hash changes with every release, and a macOS
 * keychain ACL binds to the writing process's Designated Requirement — which
 * means "Always Allow" can never stick to it (openclaw/gogcli#569, closed
 * without a fix). Every `gog auth *` call can therefore raise "gog wants to use
 * your confidential information stored in 'gogcli' in your keychain". Reported
 * by a user as the popup that "keeps coming back when I re-check".
 *
 * We can't stop the prompt — that's gog's signing, not ours — but we can stop
 * asking on every navigation. Re-check clears this (see
 * `recheckConnectStatus`), so the one path whose entire job is "look again"
 * still really looks.
 *
 * One global TTL over the whole key space, with one documented exception
 * below. Most of these are cheap read-only probes on a single-user local app,
 * so per-command freshness policy would be machinery for nothing.
 */
const TTL_MS = 5 * 60_000

/**
 * The exception the note above anticipated: account/status probes that are
 * expensive, may touch the network or keychain, and change only after an
 * explicit sign-in or sign-out.
 *
 * `kiro-cli whoami --format json` measures at **2.14s** on a real machine, and
 * it is the entire cost of a cold /connect or /network render — `gh api user`
 * (0.42s, a real network round-trip), `beeper chats list` (0.67s),
 * `claude auth status` (0.23s) and `gog auth list` (0.16s) all finish in
 * parallel underneath it. Both pages already stream a skeleton, so nothing
 * freezes; what the user waits on is the cards, every time the 5-minute TTL
 * lapses mid-session.
 *
 * Signing in or out is a deliberate act that happens once, not something that
 * drifts — and the one path whose job is "look again", Re-check, calls
 * `clearExecMemo` and so is unaffected by any TTL. So these get an hour.
 *
 * Keyed on the account subcommand, not the binary: presence checks such as
 * `which kiro-cli` keep the short TTL, so installing a tool appears promptly.
 * Re-check clears this cache before probing, which keeps status changes under
 * the user's control without making ordinary navigation repeat slow work.
 */
const SLOW_AUTH_PROBES = [
  ["kiro-cli", "whoami"],
  ["beeper", "chats"],
  ["beeper", "--read-only"],
  ["gh", "api"],
  ["claude", "auth"],
  ["gog", "auth"],
] as const
const SLOW_TTL_MS = 60 * 60_000

function ttlFor(command: string, args: string[]): number {
  const slow = SLOW_AUTH_PROBES.some(([bin, sub]) => command === bin && args[0] === sub)
  return slow ? SLOW_TTL_MS : TTL_MS
}

const cache = new Map<string, { at: number; value: Promise<ExecResult> }>()

/** Drop every memoized probe, so the next call really re-runs it. */
export function clearExecMemo(): void {
  cache.clear()
}

export function memoizedExecFile(
  command: string,
  args: string[],
  execFn: (command: string, args: string[]) => Promise<ExecResult> = execFileAsync,
  nowMs: () => number = Date.now
): Promise<ExecResult> {
  const key = JSON.stringify([command, args])
  const now = nowMs()
  const hit = cache.get(key)
  if (hit && now - hit.at < ttlFor(command, args)) return hit.value

  // A rejection is never cached: `which gog` failing once (or a keychain prompt
  // the user dismissed) must not pin "not installed" for the next 5 minutes.
  const value = execFn(command, args).catch((err: unknown) => {
    cache.delete(key)
    throw err
  })
  cache.set(key, { at: now, value })
  return value
}
