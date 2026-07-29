"use server"

import { updateStatusImpl } from "./update-status-impl"
import type { UpdateStatus } from "./update-status-impl"
import { readUpdate, writeUpdate } from "./update-store"
import { fetchLatestReleaseImpl } from "./fetch-latest-release-impl"
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

export async function dismissUpdate(version: string): Promise<void> {
  const stored = readUpdate()
  writeUpdate({
    lastCheckedAt: stored?.lastCheckedAt ?? Date.now(),
    latestVersion: stored?.latestVersion ?? version,
    dismissedVersion: version,
  })
}
