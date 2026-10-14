import { describe, it, expect } from "vitest"
import { refuseNonLocal } from "./local-request"

const LOCAL = "127.0.0.1:4319"

function req(init: {
  method?: string
  host?: string | null
  origin?: string | null
  contentType?: string | null
}): Request {
  const headers = new Headers()
  if (init.host !== null) headers.set("host", init.host ?? LOCAL)
  if (init.origin != null) headers.set("origin", init.origin)
  if (init.contentType != null) headers.set("content-type", init.contentType)
  const method = init.method ?? "GET"
  return new Request("http://127.0.0.1:4319/api/thing", {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : "{}",
  })
}

const ok = (r: Request) => refuseNonLocal(r) === null
const status = (r: Request) => refuseNonLocal(r)?.status

describe("refuseNonLocal", () => {
  it("allows a same-origin JSON write from the app's own page", () => {
    expect(
      ok(req({ method: "POST", origin: "http://127.0.0.1:4319", contentType: "application/json" }))
    ).toBe(true)
  })

  it("allows a GET with no Origin — EventSource and download navigations send none", () => {
    expect(ok(req({ method: "GET" }))).toBe(true)
  })

  it("refuses a cross-origin write even when Origin and Host agree (DNS rebinding)", () => {
    // The attack the plain Origin===Host check cannot see: both headers are
    // the attacker's domain, rebound to 127.0.0.1, so they match each other.
    expect(
      status(
        req({
          method: "POST",
          host: "evil.example",
          origin: "http://evil.example",
          contentType: "application/json",
        })
      )
    ).toBe(403)
  })

  it("refuses a rebound GET too, so reads cannot be stolen that way", () => {
    expect(status(req({ method: "GET", host: "evil.example" }))).toBe(403)
  })

  it("refuses a LAN-addressed request", () => {
    expect(status(req({ method: "GET", host: "192.168.1.5:3000" }))).toBe(403)
  })

  it("refuses an ordinary cross-origin CSRF post", () => {
    expect(
      status(req({ method: "POST", origin: "https://evil.example", contentType: "application/json" }))
    ).toBe(403)
  })

  it("refuses a write with no Origin at all", () => {
    expect(status(req({ method: "POST", contentType: "application/json" }))).toBe(403)
  })

  it("refuses a text/plain write — a simple request needs no preflight", () => {
    // Request.json() parses this happily, which is exactly why the
    // content-type has to be checked rather than assumed.
    expect(
      status(req({ method: "POST", origin: "http://127.0.0.1:4319", contentType: "text/plain" }))
    ).toBe(415)
  })

  it("refuses a write with a malformed Origin", () => {
    expect(
      status(req({ method: "POST", origin: "not a url", contentType: "application/json" }))
    ).toBe(403)
  })

  it("guards DELETE and PUT, not just POST", () => {
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      expect(status(req({ method, origin: "https://evil.example", contentType: "application/json" }))).toBe(403)
    }
  })

  it("accepts localhost and [::1] as loopback", () => {
    expect(ok(req({ method: "GET", host: "localhost:3000" }))).toBe(true)
    expect(ok(req({ method: "GET", host: "[::1]:4319" }))).toBe(true)
  })
})
