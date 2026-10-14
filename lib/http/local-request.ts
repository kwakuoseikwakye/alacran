/**
 * The check a Next route handler has to do for itself.
 *
 * Server actions get CSRF protection from Next; route handlers get none. So
 * every handler under app/api calls this first. Two separate questions,
 * because they fail to two different attacks:
 *
 *   1. **Is this server's own address the one the browser actually resolved?**
 *      Checked on every method, GET included. An `Origin === Host` comparison
 *      alone does NOT survive DNS rebinding: an attacker who points
 *      `evil.com` at 127.0.0.1 sends `Origin: http://evil.com` and
 *      `Host: evil.com`, which match each other perfectly, and the request is
 *      same-origin by then so the preflight below never fires either. Pinning
 *      Host to a loopback literal is what makes the two headers mean
 *      something: the browser writes Host from the URL it resolved, and a page
 *      served from a rebound domain can never make it say `127.0.0.1`.
 *
 *   2. **Did this request come from a page this server served?**
 *      Mutating methods only. Browsers always attach `Origin` to a
 *      cross-origin POST, so this is what rejects an ordinary CSRF post.
 *      GET is deliberately exempt: a same-origin `EventSource` and a
 *      top-level download navigation both omit `Origin`, and requiring it
 *      would break the terminal stream and the skill download. Reading is
 *      already safe without it — this app sends no
 *      `Access-Control-Allow-Origin`, so a cross-origin GET response is
 *      opaque to its caller, and every GET here is free of side effects by
 *      construction (the terminal's GET is attach-only for exactly this
 *      reason).
 *
 * The JSON content-type requirement rides along on mutating methods, and is
 * not decoration: `Request.json()` parses a body regardless of its
 * content-type, so without this a `text/plain` post — a CORS *simple* request,
 * sent with no preflight — reaches the handler fully parsed.
 *
 * Neither check defends against a non-browser client, which writes both
 * headers freely; nothing carried in a header can. What keeps a stray `curl`
 * off this server is that it listens on loopback only — `HOSTNAME=127.0.0.1`
 * in both packaging scripts, `-H 127.0.0.1` in the dev and start scripts.
 */

const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])

function refuse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * A Response to return immediately, or null when the request may proceed.
 *
 * Shaped as a value rather than a thrown error so a handler's first line reads
 * `const refusal = refuseNonLocal(request); if (refusal) return refusal` —
 * one line, impossible to half-apply.
 */
export function refuseNonLocal(request: Request): Response | null {
  const host = request.headers.get("host")
  if (!host || !LOOPBACK_HOST.test(host)) return refuse("Forbidden", 403)

  if (!MUTATING.has(request.method)) return null

  const origin = request.headers.get("origin")
  if (!origin) return refuse("Forbidden", 403)
  try {
    if (new URL(origin).host !== host) return refuse("Forbidden", 403)
  } catch {
    return refuse("Forbidden", 403)
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return refuse("Expected application/json", 415)
  }

  return null
}
