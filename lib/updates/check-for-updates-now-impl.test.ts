import { describe, it, expect } from "vitest"
import { checkForUpdatesNowImpl } from "./check-for-updates-now-impl"
import type { StoredUpdate } from "./update-store"

const NOW = 1_800_000_000_000

function harness(opts: {
  enabled?: boolean
  currentVersion?: string
  stored?: StoredUpdate | null
  latest?: string | null
  fetchThrows?: boolean
}) {
  const writes: StoredUpdate[] = []
  let fetchCalls = 0
  const run = () =>
    checkForUpdatesNowImpl({
      enabled: opts.enabled ?? true,
      currentVersion: opts.currentVersion ?? "0.1.0",
      now: NOW,
      read: () => opts.stored ?? null,
      write: (u) => void writes.push(u),
      fetchLatest: async () => {
        fetchCalls++
        if (opts.fetchThrows) throw new Error("offline")
        return opts.latest ?? null
      },
    })
  return { run, writes, calls: () => fetchCalls }
}

describe("checkForUpdatesNowImpl", () => {
  it("reports disabled without ever touching the network", async () => {
    const h = harness({ enabled: false, latest: "v9.9.9" })
    expect(await h.run()).toEqual({ checked: false, reason: "disabled" })
    expect(h.calls()).toBe(0)
  })

  it("reports an available update", async () => {
    const h = harness({ currentVersion: "0.1.0", latest: "v0.2.0" })
    expect(await h.run()).toEqual({
      checked: true,
      available: true,
      latestVersion: "v0.2.0",
      currentVersion: "0.1.0",
    })
  })

  it("reports up to date when already on the latest", async () => {
    const h = harness({ currentVersion: "0.2.0", latest: "v0.2.0" })
    expect(await h.run()).toEqual({
      checked: true,
      available: false,
      latestVersion: "v0.2.0",
      currentVersion: "0.2.0",
    })
  })

  it("always hits the network even inside the normal check interval", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - 1000, latestVersion: "v0.1.0" },
      latest: "v0.2.0",
    })
    await h.run()
    expect(h.calls()).toBe(1)
  })

  it("reports an update the user already dismissed, unlike the banner", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - 1000, latestVersion: "v0.2.0", dismissedVersion: "v0.2.0" },
      latest: "v0.2.0",
    })
    const result = await h.run()
    expect(result.checked && result.available).toBe(true)
  })

  it("preserves an existing dismissal in storage across a manual check", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - 1000, latestVersion: "v0.2.0", dismissedVersion: "v0.2.0" },
      latest: "v0.2.0",
    })
    await h.run()
    expect(h.writes[0].dismissedVersion).toBe("v0.2.0")
  })

  it("falls back to the cached version when offline", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - 1000, latestVersion: "v0.2.0" },
      fetchThrows: true,
    })
    expect(await h.run()).toEqual({
      checked: true,
      available: true,
      latestVersion: "v0.2.0",
      currentVersion: "0.1.0",
    })
    expect(h.writes).toHaveLength(0)
  })

  it("reports offline with nothing cached", async () => {
    const h = harness({ currentVersion: "0.1.0", stored: null, fetchThrows: true })
    expect(await h.run()).toEqual({ checked: false, reason: "offline" })
  })
})
