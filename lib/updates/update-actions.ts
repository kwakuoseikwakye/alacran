"use server"

import { updateStatusImpl } from "./update-status-impl"
import type { UpdateStatus } from "./update-status-impl"
import { readUpdate, writeUpdate } from "./update-store"
import { fetchLatestReleaseImpl } from "./fetch-latest-release-impl"
import { performLinuxUpdateImpl, type PerformUpdateResult } from "./perform-linux-update-impl"
import { performMacUpdateImpl } from "./perform-mac-update-impl"
import { restartAppImpl } from "./restart-app-impl"
import { checkForUpdatesNowImpl, type ManualCheckResult } from "./check-for-updates-now-impl"
import { APP_VERSION } from "../app-version"

// Only the packaged app checks. In `next dev` there is nothing to update to,
// and a developer does not need their own tooling nagging them. Set
// ALACRAN_NO_UPDATE_CHECK=1 to switch it off entirely in a real build.
function isEnabled(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.ALACRAN_NO_UPDATE_CHECK
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  try {
    return await updateStatusImpl({
      enabled: isEnabled(),
      currentVersion: APP_VERSION,
      now: Date.now(),
      read: () => readUpdate(),
      write: (u) => writeUpdate(u),
      fetchLatest: () => fetchLatestReleaseImpl(),
    })
  } catch {
    // Belt and braces: this runs in the root layout, so an unexpected throw
    // here would blank the entire app over a cosmetic banner.
    return { available: false }
  }
}

/** The Settings page's "Check for updates" button — bypasses the 24h throttle. */
export async function checkForUpdatesNow(): Promise<ManualCheckResult> {
  return checkForUpdatesNowImpl({
    enabled: isEnabled(),
    currentVersion: APP_VERSION,
    now: Date.now(),
    read: () => readUpdate(),
    write: (u) => writeUpdate(u),
    fetchLatest: () => fetchLatestReleaseImpl(),
  })
}

export async function dismissUpdate(version: string): Promise<void> {
  const stored = readUpdate()
  writeUpdate({
    lastCheckedAt: stored?.lastCheckedAt ?? Date.now(),
    latestVersion: stored?.latestVersion ?? version,
    dismissedVersion: version,
  })
}

/**
 * Install the latest release in place, on whichever platform we're on.
 *
 * Linux downloads a .deb and installs it through a native pkexec prompt;
 * macOS swaps the running .app bundle for a freshly downloaded one (see
 * perform-mac-update-impl.ts — no password prompt, and no Gatekeeper problem,
 * because a fetch-downloaded payload is never quarantined). Windows has no
 * packaged build at all, so it keeps the download link.
 */
export async function performUpdate(): Promise<PerformUpdateResult> {
  if (process.platform === "linux") return performLinuxUpdateImpl()
  if (process.platform === "darwin") return performMacUpdateImpl()
  return { ok: false, message: "Automatic updates aren't available on this platform." }
}

/**
 * Fires the relaunch and returns immediately — the caller (the update
 * banner) is expected to poll for the server coming back, not await this
 * finishing, because this process exits shortly after returning.
 */
export async function restartApp(): Promise<void> {
  restartAppImpl()
  setTimeout(() => process.exit(0), 300)
}
