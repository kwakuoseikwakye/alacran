import { describe, it, expect } from "vitest"
import { validateLicenseImpl } from "./validate-license-impl"
import type { FetchLike } from "./validate-license-impl"

describe("validateLicenseImpl", () => {
  it("reports valid when Lemon Squeezy returns valid:true", async () => {
    const fetchFn: FetchLike = async () => ({ json: async () => ({ valid: true, error: null }) })
    expect(await validateLicenseImpl("KEY", fetchFn)).toEqual({ valid: true, message: "License active" })
  })

  it("reports invalid with the server's error message when valid:false", async () => {
    const fetchFn: FetchLike = async () => ({ json: async () => ({ valid: false, error: "license_key not found" }) })
    expect(await validateLicenseImpl("KEY", fetchFn)).toEqual({ valid: false, message: "license_key not found" })
  })

  it("POSTs the license key to the LS validate endpoint", async () => {
    let sentBody: string | undefined
    const fetchFn: FetchLike = async (_url, init) => {
      sentBody = init.body as string
      return { json: async () => ({ valid: true }) }
    }
    await validateLicenseImpl("ABC-123", fetchFn)
    expect(JSON.parse(sentBody!)).toEqual({ license_key: "ABC-123" })
  })

  it("propagates a thrown network error to the caller", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("network down")
    }
    await expect(validateLicenseImpl("KEY", fetchFn)).rejects.toThrow("network down")
  })
})
