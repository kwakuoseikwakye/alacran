import type { StoredUpdate } from "./update-store"
import { compareVersions } from "./compare-versions"

export type UpdateStatus = {
  /** True only when a newer release exists AND the user hasn't dismissed it. */
  available: boolean
  latestVersion?: string
  currentVersion?: string
}

// Ask GitHub at most this often. A desktop app checking once a day is plenty
// to get people off a bad build within a release cycle, without turning into
// a heartbeat that quietly tracks when the user is at their desk.
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 1 day

const NONE: UpdateStatus = { available: false }

/**
 * Decide whether to show the "new version" banner.
 *
 * Every failure path returns "no update" rather than throwing. A banner is the
 * least important thing on the screen, so it must never be able to break a
 * page render, block the app offline, or nag about a version already dismissed.
 */
export async function updateStatusImpl(opts: {
  enabled: boolean
  currentVersion: string
  now: number
  read: () => StoredUpdate | null
  write: (u: StoredUpdate) => void
  fetchLatest: () => Promise<string | null>
}): Promise<UpdateStatus> {
  if (!opts.enabled) return NONE

  const stored = opts.read()
  let latest = stored?.latestVersion
  const age = stored ? opts.now - stored.lastCheckedAt : Infinity

  if (age >= CHECK_INTERVAL_MS) {
    try {
      const fetched = await opts.fetchLatest()
      if (fetched) {
        latest = fetched
        opts.write({
          lastCheckedAt: opts.now,
          latestVersion: fetched,
          dismissedVersion: stored?.dismissedVersion,
        })
      } else {
        // Reachable but nothing to report (rate-limited, no releases yet).
        // Record the attempt so we don't retry on every single render.
        opts.write({
          lastCheckedAt: opts.now,
          latestVersion: stored?.latestVersion ?? "",
          dismissedVersion: stored?.dismissedVersion,
        })
      }
    } catch {
      // Offline. Fall through to whatever we already knew; do NOT stamp
      // lastCheckedAt, so we retry rather than going quiet for a full day
      // after a single blip.
    }
  }

  if (!latest) return NONE
  if (stored?.dismissedVersion && compareVersions(latest, stored.dismissedVersion) <= 0) return NONE
  if (compareVersions(latest, opts.currentVersion) <= 0) return NONE

  return { available: true, latestVersion: latest, currentVersion: opts.currentVersion }
}
