import { readVoiceSettingsImpl } from "./settings-impl"

/**
 * Swap the user's long-lived Deepgram key for a short-lived grant.
 *
 * **The key never reaches the browser.** Microphone capture has to happen in
 * the renderer, and Deepgram's streaming API is a WebSocket the renderer opens
 * itself — so something has to be handed to the client. Handing it the real
 * key would put a permanent credential into page JavaScript, where any script
 * on the page can read it and where it survives in devtools history.
 *
 * This is the same shape Jinsoku's own backend uses for exactly this problem
 * (`deepgram_handler.go` mints a grant rather than proxying audio), and it is
 * worth copying rather than re-deriving: the grant is scoped to `usage:write`
 * and expires, so the worst case is a bounded window rather than a leaked key.
 *
 * Audio never passes through Alacrán either — the renderer streams straight to
 * Deepgram. This server only brokers the credential.
 */

const GRANT_URL = "https://api.deepgram.com/v1/auth/grant"

/** Deepgram's own maximum. Shorter would mean re-minting mid-sentence; longer
 *  is refused by the API. A session outliving it must re-request, which the
 *  client does on reconnect. */
const GRANT_TTL_SECONDS = 3600

export type FetchFn = typeof fetch

export type DeepgramGrant =
  | { ok: true; token: string; expiresIn: number }
  | { ok: false; message: string }

export async function mintDeepgramGrantImpl(
  fetchFn: FetchFn = fetch,
  readSettings: typeof readVoiceSettingsImpl = readVoiceSettingsImpl
): Promise<DeepgramGrant> {
  const { providerId, apiKey } = await readSettings()
  if (providerId !== "deepgram") {
    return { ok: false, message: "Voice is not set to Deepgram. Change it in Settings." }
  }
  if (!apiKey) {
    return { ok: false, message: "No Deepgram key saved yet. Add one in Settings." }
  }

  let response: Response
  try {
    response = await fetchFn(GRANT_URL, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: GRANT_TTL_SECONDS }),
    })
  } catch (err) {
    return { ok: false, message: `Couldn't reach Deepgram — ${err instanceof Error ? err.message : String(err)}` }
  }

  if (!response.ok) {
    // 401 and 403 are different problems with different fixes, and collapsing
    // them into "check your key" is a dead end: a 403 here means the key is
    // CORRECT and simply isn't allowed to mint a temporary token, so the
    // message sent people back to re-paste a key that was never wrong.
    // Measured against a real Deepgram key, not read off the docs: the same
    // key returns 200 from GET /v1/projects while POST /v1/auth/grant returns
    // 403 "Insufficient permissions".
    //
    // Still no body parsing. The status IS a stable contract; the bodies are
    // not — that one account answered the grant call with `err_code`/`err_msg`
    // and the keys endpoint with `category`/`message`/`details` in the same
    // minute.
    const reason =
      response.status === 401
        ? "Deepgram didn't recognise that key. Check it in Settings."
        : response.status === 403
          ? "That Deepgram key is valid, but it isn't allowed to start a listening session. In the Deepgram console, create a key with Owner or Admin rights and paste that one instead."
          : `Deepgram returned ${response.status}.`
    return { ok: false, message: reason }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { ok: false, message: "Deepgram sent a reply this app couldn't read." }
  }

  const { access_token, expires_in } = (payload ?? {}) as Record<string, unknown>
  if (typeof access_token !== "string" || !access_token) {
    return { ok: false, message: "Deepgram didn't return a usable pass." }
  }
  return {
    ok: true,
    token: access_token,
    expiresIn: typeof expires_in === "number" ? expires_in : GRANT_TTL_SECONDS,
  }
}

/**
 * `nova-3`, not `nova-2-general`, and the difference is not cosmetic.
 *
 * Measured against the real streaming socket for all nine languages the picker
 * offers: nova-2 refuses Arabic outright (`ar` and `ar-SA` both fail the
 * handshake) while nova-3 accepts every one of them. Two of the nine entries
 * were therefore dead on arrival under nova-2 — the socket was rejected before
 * a word could be said.
 */
const MODEL = "nova-3"

/**
 * The picker speaks BCP-47 because `SpeechRecognition` and `speechSynthesis`
 * do. Deepgram mostly agrees, and where it doesn't the socket is refused at the
 * handshake — so the exceptions are listed rather than hoped about.
 *
 * Verified one at a time against `wss://api.deepgram.com/v1/listen`, not read
 * off a docs page: `hi-IN` fails on every model and `hi` succeeds; the other
 * eight of the picker's codes pass unchanged on nova-3.
 */
const DEEPGRAM_LANGUAGE: Record<string, string> = { "hi-IN": "hi" }

export function deepgramLanguage(code: string): string {
  return DEEPGRAM_LANGUAGE[code] ?? code
}

/**
 * The socket URL the client opens, with the audio format baked in so the
 * client and this app cannot disagree about it.
 *
 * **`sampleRate` is the rate the capture graph really runs at, not a constant.**
 * It used to be a hardcoded 16000 matching what the client asks its
 * AudioContext for — but a request is not a guarantee (Chromium honours it,
 * WebKit is free not to), and a mismatch here is unfalsifiable from the
 * outside: the socket opens, audio flows, and every transcript comes back empty
 * or garbled with nothing reporting an error.
 *
 * Deliberately NOT included, because Jinsoku hit real 400s from them on a
 * standard plan: `utterance_end_ms`, `detect_language`, `smart_format`. Do not
 * add them speculatively.
 */
export function deepgramSocketUrl(language: string, sampleRate = 16000): string {
  const params = new URLSearchParams({
    encoding: "linear16",
    sample_rate: String(sampleRate),
    channels: "1",
    model: MODEL,
    punctuate: "true",
    interim_results: "true",
    vad_events: "true",
    endpointing: "1000",
    language: deepgramLanguage(language),
  })
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`
}
