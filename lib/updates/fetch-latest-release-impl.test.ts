import { describe, it, expect } from "vitest"
import { fetchLatestReleaseImpl, RELEASES_API_URL } from "./fetch-latest-release-impl"
import type { FetchLike } from "./fetch-latest-release-impl"

describe("fetchLatestReleaseImpl", () => {
  it("returns the tag name of the latest release", async () => {
    const fetchFn: FetchLike = async () => ({ ok: true, json: async () => ({ tag_name: "v0.3.0" }) })
    expect(await fetchLatestReleaseImpl(fetchFn)).toBe("v0.3.0")
  })

  it("GETs the public releases-only repo and sends no body", async () => {
    // The endpoint must be reachable without a GitHub account, and the request
    // must carry nothing about the user.
    let seenUrl = ""
    let seenInit: RequestInit | undefined
    const fetchFn: FetchLike = async (url, init) => {
      seenUrl = url
      seenInit = init
      return { ok: true, json: async () => ({ tag_name: "v1.0.0" }) }
    }
    await fetchLatestReleaseImpl(fetchFn)
    expect(seenUrl).toBe(RELEASES_API_URL)
    expect(seenInit?.method).toBe("GET")
    expect(seenInit?.body).toBeUndefined()
  })

  it("returns null on a non-ok response (rate limit, or no release yet)", async () => {
    const fetchFn: FetchLike = async () => ({ ok: false, json: async () => ({ message: "rate limited" }) })
    expect(await fetchLatestReleaseImpl(fetchFn)).toBeNull()
  })

  it("ignores drafts and pre-releases", async () => {
    const draft: FetchLike = async () => ({ ok: true, json: async () => ({ tag_name: "v9.9.9", draft: true }) })
    expect(await fetchLatestReleaseImpl(draft)).toBeNull()
    const pre: FetchLike = async () => ({ ok: true, json: async () => ({ tag_name: "v9.9.9", prerelease: true }) })
    expect(await fetchLatestReleaseImpl(pre)).toBeNull()
  })

  it("returns null when the payload has no usable tag", async () => {
    const fetchFn: FetchLike = async () => ({ ok: true, json: async () => ({ tag_name: 42 }) })
    expect(await fetchLatestReleaseImpl(fetchFn)).toBeNull()
  })

  it("propagates a network error so the caller can apply its offline policy", async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error("ENOTFOUND")
    }
    await expect(fetchLatestReleaseImpl(fetchFn)).rejects.toThrow("ENOTFOUND")
  })
})
