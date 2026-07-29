import { describe, it, expect } from "vitest"
import { updateStatusImpl, CHECK_INTERVAL_MS } from "./update-status-impl"
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
    updateStatusImpl({
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

describe("updateStatusImpl", () => {
  it("reports an update when the released version is newer", async () => {
    const h = harness({ currentVersion: "0.1.0", latest: "v0.2.0" })
    expect(await h.run()).toEqual({ available: true, latestVersion: "v0.2.0", currentVersion: "0.1.0" })
  })

  it("stays quiet when the user is already on the newest version", async () => {
    const h = harness({ currentVersion: "0.2.0", latest: "v0.2.0" })
    expect(await h.run()).toEqual({ available: false })
  })

  it("stays quiet when the user is somehow ahead of the release", async () => {
    // A developer running a local build must not be told to downgrade.
    const h = harness({ currentVersion: "0.3.0", latest: "v0.2.0" })
    expect(await h.run()).toEqual({ available: false })
  })

  it("never checks or reports when disabled", async () => {
    const h = harness({ enabled: false, latest: "v9.9.9" })
    expect(await h.run()).toEqual({ available: false })
    expect(h.calls()).toBe(0)
  })

  it("does not hit the network again inside the check interval", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - 1000, latestVersion: "v0.2.0" },
      latest: "v0.2.0",
    })
    expect((await h.run()).available).toBe(true)
    expect(h.calls()).toBe(0)
  })

  it("re-checks once the interval has elapsed", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - CHECK_INTERVAL_MS - 1, latestVersion: "v0.1.0" },
      latest: "v0.5.0",
    })
    expect((await h.run()).latestVersion).toBe("v0.5.0")
    expect(h.calls()).toBe(1)
  })

  it("stays quiet about a version the user already dismissed", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - 1000, latestVersion: "v0.2.0", dismissedVersion: "v0.2.0" },
    })
    expect(await h.run()).toEqual({ available: false })
  })

  it("speaks up again for a version newer than the dismissed one", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - 1000, latestVersion: "v0.3.0", dismissedVersion: "v0.2.0" },
    })
    expect((await h.run()).available).toBe(true)
  })

  it("falls back to the cached version when offline, and does not stamp the check time", async () => {
    // Not stamping matters: a single blip must not silence the check for a day.
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - CHECK_INTERVAL_MS - 1, latestVersion: "v0.2.0" },
      fetchThrows: true,
    })
    expect((await h.run()).available).toBe(true)
    expect(h.writes).toHaveLength(0)
  })

  it("reports nothing when offline with no cached result", async () => {
    const h = harness({ currentVersion: "0.1.0", stored: null, fetchThrows: true })
    expect(await h.run()).toEqual({ available: false })
  })

  it("records the attempt when the API returns nothing, so it stops retrying every render", async () => {
    const h = harness({ currentVersion: "0.1.0", stored: null, latest: null })
    expect(await h.run()).toEqual({ available: false })
    expect(h.writes).toHaveLength(1)
    expect(h.writes[0].lastCheckedAt).toBe(NOW)
  })

  it("preserves an existing dismissal across a re-check", async () => {
    const h = harness({
      currentVersion: "0.1.0",
      stored: { lastCheckedAt: NOW - CHECK_INTERVAL_MS - 1, latestVersion: "v0.2.0", dismissedVersion: "v0.2.0" },
      latest: "v0.2.0",
    })
    await h.run()
    expect(h.writes[0].dismissedVersion).toBe("v0.2.0")
  })
})
