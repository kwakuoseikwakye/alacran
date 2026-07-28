import { describe, it, expect } from "vitest"
import { licenseStatusImpl, REVALIDATE_MS, OFFLINE_GRACE_MS } from "./license-status-impl"
import type { StoredLicense } from "./license-store"
import type { LicenseValidation } from "./validate-license-impl"

const NOW = 1_000_000_000_000

function harness(overrides: {
  enforced?: boolean
  stored?: StoredLicense | null
  validate?: (key: string) => Promise<LicenseValidation>
}) {
  const writes: StoredLicense[] = []
  return {
    writes,
    run: () =>
      licenseStatusImpl({
        enforced: overrides.enforced ?? true,
        now: NOW,
        read: () => overrides.stored ?? null,
        write: (l) => writes.push(l),
        validate: overrides.validate ?? (async () => ({ valid: true, message: "ok" })),
      }),
  }
}

describe("licenseStatusImpl", () => {
  it("is always licensed when enforcement is off (dev / bypass)", async () => {
    const h = harness({ enforced: false, stored: null })
    expect(await h.run()).toEqual({ licensed: true })
  })

  it("is unlicensed when no key is stored", async () => {
    const h = harness({ stored: null })
    expect(await h.run()).toEqual({ licensed: false })
  })

  it("trusts a recent valid cache without hitting the server", async () => {
    let called = false
    const h = harness({
      stored: { key: "K", lastValidatedAt: NOW - REVALIDATE_MS + 1000, lastResult: "valid" },
      validate: async () => {
        called = true
        return { valid: true, message: "ok" }
      },
    })
    expect(await h.run()).toEqual({ licensed: true })
    expect(called).toBe(false)
  })

  it("re-validates an expired cache and stays licensed when the server says valid", async () => {
    const h = harness({
      stored: { key: "K", lastValidatedAt: NOW - REVALIDATE_MS - 1, lastResult: "valid" },
      validate: async () => ({ valid: true, message: "ok" }),
    })
    expect(await h.run()).toEqual({ licensed: true })
    expect(h.writes).toEqual([{ key: "K", lastValidatedAt: NOW, lastResult: "valid" }])
  })

  it("becomes unlicensed when the server says the key is invalid", async () => {
    const h = harness({
      stored: { key: "K", lastValidatedAt: NOW - REVALIDATE_MS - 1, lastResult: "valid" },
      validate: async () => ({ valid: false, message: "expired" }),
    })
    expect(await h.run()).toEqual({ licensed: false, message: "expired" })
    expect(h.writes[0].lastResult).toBe("invalid")
  })

  it("stays licensed on a network error within the offline grace window", async () => {
    const h = harness({
      stored: { key: "K", lastValidatedAt: NOW - OFFLINE_GRACE_MS + 1000, lastResult: "valid" },
      validate: async () => {
        throw new Error("offline")
      },
    })
    expect(await h.run()).toEqual({ licensed: true })
  })

  it("becomes unlicensed on a network error past the offline grace window", async () => {
    const h = harness({
      stored: { key: "K", lastValidatedAt: NOW - OFFLINE_GRACE_MS - 1, lastResult: "valid" },
      validate: async () => {
        throw new Error("offline")
      },
    })
    const result = await h.run()
    expect(result.licensed).toBe(false)
  })
})
