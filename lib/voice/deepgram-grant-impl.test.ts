import { describe, expect, it, vi } from "vitest"
import { mintDeepgramGrantImpl, deepgramSocketUrl, deepgramLanguage, type FetchFn } from "./deepgram-grant-impl"

const settings = (providerId: string, apiKey?: string) => async () =>
  ({ providerId, apiKey }) as never

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe("mintDeepgramGrantImpl", () => {
  it("refuses when the provider isn't Deepgram, without calling out", async () => {
    const fetchFn = vi.fn() as unknown as FetchFn
    const result = await mintDeepgramGrantImpl(fetchFn, settings("browser"))
    expect(result.ok).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("refuses when no key is saved, without calling out", async () => {
    const fetchFn = vi.fn() as unknown as FetchFn
    const result = await mintDeepgramGrantImpl(fetchFn, settings("deepgram"))
    expect(result).toEqual({ ok: false, message: "No Deepgram key saved yet. Add one in Settings." })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("sends the key as a Token header and asks for a bounded TTL", async () => {
    const calls: [string, RequestInit | undefined][] = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push([url, init])
      return jsonResponse(200, { access_token: "grant-abc", expires_in: 3600 })
    }) as unknown as FetchFn

    await mintDeepgramGrantImpl(fetchFn, settings("deepgram", "dg-secret"))
    const [url, init] = calls[0]
    expect(url).toBe("https://api.deepgram.com/v1/auth/grant")
    expect((init?.headers as Record<string, string>).Authorization).toBe("Token dg-secret")
    expect(JSON.parse(String(init?.body))).toEqual({ ttl_seconds: 3600 })
  })

  it("returns the short-lived grant, never the long-lived key", async () => {
    const fetchFn = (async () =>
      jsonResponse(200, { access_token: "grant-abc", expires_in: 900 })) as unknown as FetchFn
    const result = await mintDeepgramGrantImpl(fetchFn, settings("deepgram", "dg-secret"))
    expect(result).toEqual({ ok: true, token: "grant-abc", expiresIn: 900 })
    expect(JSON.stringify(result)).not.toContain("dg-secret")
  })

  it("says the key is wrong on 401 rather than showing a bare status", async () => {
    const fetchFn = (async () => jsonResponse(401, {})) as unknown as FetchFn
    const result = await mintDeepgramGrantImpl(fetchFn, settings("deepgram", "bad"))
    expect(result).toEqual({ ok: false, message: "Deepgram didn't recognise that key. Check it in Settings." })
  })

  /**
   * The two statuses must not share a message. A real, correct key that lacks
   * the rights to mint a token answers 403 here while answering 200 from
   * GET /v1/projects — so "check it in Settings" sends someone to re-paste a
   * key that was never the problem. Measured, not assumed.
   */
  it("tells a 403 apart from a 401, because the key is fine and the fix is a different one", async () => {
    const fetchFn = (async () =>
      jsonResponse(403, { err_code: "FORBIDDEN", err_msg: "Insufficient permissions." })) as unknown as FetchFn
    const result = await mintDeepgramGrantImpl(fetchFn, settings("deepgram", "valid-but-limited"))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("isn't allowed to start a listening session")
    expect(result.message).toContain("Owner or Admin")
    expect(result.message).not.toContain("Check it in Settings")
  })

  it("reports other statuses without inventing a reason", async () => {
    const fetchFn = (async () => jsonResponse(503, {})) as unknown as FetchFn
    const result = await mintDeepgramGrantImpl(fetchFn, settings("deepgram", "k"))
    expect(result).toEqual({ ok: false, message: "Deepgram returned 503." })
  })

  it("handles a network failure without throwing", async () => {
    const fetchFn = (async () => {
      throw new Error("getaddrinfo ENOTFOUND")
    }) as unknown as FetchFn
    const result = await mintDeepgramGrantImpl(fetchFn, settings("deepgram", "k"))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain("Couldn't reach Deepgram")
  })

  it("refuses a 200 that carries no token", async () => {
    const fetchFn = (async () => jsonResponse(200, { nope: true })) as unknown as FetchFn
    const result = await mintDeepgramGrantImpl(fetchFn, settings("deepgram", "k"))
    expect(result).toEqual({ ok: false, message: "Deepgram didn't return a usable pass." })
  })
})

describe("deepgramSocketUrl", () => {
  it("bakes in the exact format the capture worklet produces", async () => {
    const url = new URL(deepgramSocketUrl("ja"))
    expect(url.protocol).toBe("wss:")
    expect(url.searchParams.get("encoding")).toBe("linear16")
    expect(url.searchParams.get("sample_rate")).toBe("16000")
    expect(url.searchParams.get("channels")).toBe("1")
    expect(url.searchParams.get("language")).toBe("ja")
  })

  it("omits the three params that 400 on a standard plan", () => {
    // Jinsoku hit real 400s from these; they must not be re-added speculatively.
    const url = deepgramSocketUrl("en")
    expect(url).not.toContain("utterance_end_ms")
    expect(url).not.toContain("detect_language")
    expect(url).not.toContain("smart_format")
  })

  /**
   * The rate is what the capture graph really runs at, never an assumption.
   * Chromium honours a 16 kHz request and WebKit is free not to, and a
   * mismatch is invisible from outside: the socket opens, audio flows, and
   * every transcript comes back empty with nothing reporting an error.
   */
  it("declares the sample rate it is given, not a constant", () => {
    expect(new URL(deepgramSocketUrl("en-US", 44100)).searchParams.get("sample_rate")).toBe("44100")
    expect(new URL(deepgramSocketUrl("en-US", 48000)).searchParams.get("sample_rate")).toBe("48000")
  })
})

describe("deepgramLanguage", () => {
  /**
   * Measured one at a time against the real streaming socket, not read off a
   * docs page. `hi-IN` is refused at the handshake by every model; `hi` is
   * accepted. A refused handshake is the worst failure this feature has — the
   * orb listens forever — so the exceptions are a table, not an assumption.
   */
  it("rewrites the one picker code Deepgram refuses", () => {
    expect(deepgramLanguage("hi-IN")).toBe("hi")
  })

  it("passes through the eight that Deepgram accepts unchanged", () => {
    for (const code of ["en-US", "es-ES", "fr-FR", "de-DE", "pt-BR", "ar-SA", "ja-JP", "zh-CN"]) {
      expect(deepgramLanguage(code)).toBe(code)
    }
  })

  /** Arabic works on nova-3 and is refused outright by nova-2, so the model
   *  choice is load-bearing for the picker rather than a preference. */
  it("uses a model that serves every language offered", () => {
    expect(new URL(deepgramSocketUrl("ar-SA")).searchParams.get("model")).toBe("nova-3")
  })
})
