import type { StoredUpdate } from "./update-store"
import { compareVersions } from "./compare-versions"

export type ManualCheckResult =
  | { checked: false; reason: "disabled" | "offline" }
  | { checked: true; available: boolean; latestVersion: string; currentVersion: string }

/**
 * The Settings page's "Check for updates" button.
 *
 * updateStatusImpl (the banner) is deliberately throttled and filters out a
 * version the user already dismissed, so it doesn't nag. A button the user
 * pressed on purpose is the opposite: it must always hit the network and
 * always report the truth, dismissed or not. It still preserves an existing
 * dismissal in storage, so the banner's own quiet-about-this-version
 * behavior is untouched by a manual check.
 */
export async function checkForUpdatesNowImpl(opts: {
  enabled: boolean
  currentVersion: string
  now: number
  read: () => StoredUpdate | null
  write: (u: StoredUpdate) => void
  fetchLatest: () => Promise<string | null>
}): Promise<ManualCheckResult> {
  if (!opts.enabled) return { checked: false, reason: "disabled" }

  const stored = opts.read()
  let latest: string | null
  try {
    latest = await opts.fetchLatest()
  } catch {
    latest = null
  }

  // Offline, or nothing came back — fall back to whatever's cached rather
  // than either lying "up to date" or losing a previously-known result.
  if (!latest) {
    if (!stored?.latestVersion) return { checked: false, reason: "offline" }
    return {
      checked: true,
      available: compareVersions(stored.latestVersion, opts.currentVersion) > 0,
      latestVersion: stored.latestVersion,
      currentVersion: opts.currentVersion,
    }
  }

  opts.write({ lastCheckedAt: opts.now, latestVersion: latest, dismissedVersion: stored?.dismissedVersion })

  return {
    checked: true,
    available: compareVersions(latest, opts.currentVersion) > 0,
    latestVersion: latest,
    currentVersion: opts.currentVersion,
  }
}
