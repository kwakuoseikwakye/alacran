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
 * ponytail: one global TTL over the whole key space, not per-command freshness
 * policy — these are all cheap read-only probes on a single-user local app.
 * Give a command its own TTL only if one actually needs different freshness.
 */
const TTL_MS = 5 * 60_000

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
  if (hit && now - hit.at < TTL_MS) return hit.value

  // A rejection is never cached: `which gog` failing once (or a keychain prompt
  // the user dismissed) must not pin "not installed" for the next 5 minutes.
  const value = execFn(command, args).catch((err: unknown) => {
    cache.delete(key)
    throw err
  })
  cache.set(key, { at: now, value })
  return value
}
