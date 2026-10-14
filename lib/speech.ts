/**
 * Browser speech in and out, shared by every surface that asks a question.
 *
 * A plain module rather than an export from a `"use client"` component, per
 * v51's finding: a Server Component importing a non-component value from a
 * client file silently gets `undefined`.
 *
 * The vendor-prefixed Web Speech API isn't under this name in lib.dom.d.ts, and
 * only four members of it are used — a local type is a smaller and more honest
 * diff than an ambient declaration claiming to describe the whole real
 * interface.
 */
export type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult:
    | ((event: {
        resultIndex?: number
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>
      }) => void)
    | null
  onerror: ((event?: { error?: string }) => void) | null
  onend: (() => void) | null
}

/**
 * The window has already proved, by failing, that nothing is behind the
 * constructor.
 *
 * A module-level flag, so it lasts exactly as long as the page does. A hard
 * reload re-learns at the cost of one failed press, which is cheap — and
 * cheaper than storage that throws in a private window and has to be wrapped
 * everywhere it is touched.
 */
let engineProvedBroken = false

/**
 * Record a use-time failure that means "there is no speech service here".
 *
 * Called by the `onerror` handlers, never by detection: the only way to learn
 * this is to try. Once set, `getSpeechRecognition()` stops handing the
 * constructor out, so every surface that already copes with an absent engine
 * copes with a dead one for free — and a second press fails honestly instead
 * of identically.
 */
export function markSpeechEngineBroken(): void {
  engineProvedBroken = true
}

export function isSpeechEngineBroken(): boolean {
  return engineProvedBroken
}

/**
 * Feature-detected, never assumed — and **presence is not capability**.
 *
 * **Measured, 2026-09-07, Electron 42.10.1 (the exact framework version the
 * packaged `Alacran.app` embeds), microphone granted, page on `http://127.0.0.1`
 * with the shell's own media permission handlers wired:** both
 * `window.SpeechRecognition` and `window.webkitSpeechRecognition` are
 * functions, `onstart` and `onaudiostart` fire — the microphone really opens —
 * and then `onerror` arrives with `error: "network"`. Chromium ships the whole
 * API surface and the URL of the Google speech service behind it
 * (`https://www.google.com/speech-api/full-duplex/v1`, present in the shipped
 * binary); Electron ships no key for it. So the constructor existing proves
 * nothing at all, and a truthiness check on it told users the assistant "did
 * not catch that" when in truth it could never have.
 *
 * This is the third time this repo has been bitten by the same shape — v53's
 * `which claude` on a machine with only the desktop app, v135's `beeper status`
 * reporting unreachable while `chats list` returned real chats — so the answer
 * is the same one: do the smallest real thing, then believe the result.
 * Absence returns undefined; a use-time failure is recorded by
 * `markSpeechEngineBroken()` and returns undefined from then on. Callers must
 * still render a typed fallback, because the first press is the only way to
 * learn.
 */
export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined
  if (engineProvedBroken) return undefined
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined
}

/**
 * The four things that actually go wrong, out of the one string the Web Speech
 * API gives us.
 *
 * **`not-allowed` and `service-not-allowed` are one hyphenated word apart and
 * mean opposite things** — the user refused the microphone, versus the machine
 * has no speech service — and sharing one message is what turned this into a
 * dead end: the person is told to check a microphone that is already working.
 * Same rule v142 wrote for Deepgram's 401 vs 403.
 */
export type SpeechFailure = "no-engine" | "microphone" | "silence" | "unclear"

/**
 * Exhaustive on purpose, as `summarizeNetworkAccess` is: an unlisted error
 * string falls to "unclear", which is the only honest bucket for one nobody
 * has seen.
 */
const FAILURE_BY_ERROR: Readonly<Record<string, SpeechFailure>> = {
  // No speech service behind the constructor. `network` is what the packaged
  // mac shell actually produces; the other two are what Chromium sends when
  // the service refuses or is absent.
  network: "no-engine",
  "service-not-allowed": "no-engine",
  "service-not-available": "no-engine",
  // The microphone itself: refused, or no input device at all.
  "not-allowed": "microphone",
  "audio-capture": "microphone",
  // Nothing was said, or the caller stopped it. Neither is a failure to report.
  "no-speech": "silence",
  aborted: "silence",
}

export function classifySpeechError(error: string | undefined): SpeechFailure {
  return (error && FAILURE_BY_ERROR[error]) || "unclear"
}

/**
 * What to put on screen for each class — one table, so the assistant page and
 * the per-company ask panel can never tell a user two different stories about
 * the same failure.
 *
 * `next` never says "below": the two surfaces put their typed input in
 * different places, and a message that points at the wrong one is the bug this
 * file is fixing, in miniature.
 */
export type SpeechFailureMessage = { caption: string; next: string }

const FAILURE_MESSAGE: Readonly<Record<SpeechFailure, SpeechFailureMessage>> = {
  "no-engine": {
    caption: "This window has no working speech engine.",
    next: "Type your question instead, or switch to Deepgram under Settings › Voice.",
  },
  microphone: {
    caption: "Microphone blocked.",
    next: "Allow microphone access and press again — or type your question instead.",
  },
  // Never shown: callers return early on silence rather than reporting it.
  silence: { caption: "", next: "" },
  unclear: { caption: "Did not catch that.", next: "" },
}

export function speechFailureMessage(failure: SpeechFailure): SpeechFailureMessage {
  return FAILURE_MESSAGE[failure]
}

/** Best-effort: the answer is always on screen as text first, so speaking it is
 *  layered on and never depended on. */
export function speak(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  } catch {
    /* ignore */
  }
}

export function cancelSpeech(): void {
  if (typeof window === "undefined") return
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}

/**
 * The installed voices.
 *
 * **`getVoices()` returns an empty array until the engine has populated it**,
 * and the engine populates it asynchronously after the page loads. That single
 * fact is why the assistant's voice used to change between answers: the first
 * reply of a session picked from an empty list and got whatever the browser
 * considered default, and every later reply picked from a full one. Anything
 * choosing a voice must therefore cope with "not yet" rather than treating the
 * first answer as the truth — see `subscribeToVoices`.
 */
export function getSpeechVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return []
  try {
    return window.speechSynthesis.getVoices() ?? []
  } catch {
    return []
  }
}

/**
 * Calls back when the voice list becomes available, and again if it changes.
 *
 * Fires immediately when voices are already loaded, because `voiceschanged`
 * has usually already been and gone by the time a component mounts — waiting
 * only for the event means a picker that stays empty forever on a warm page.
 */
export function subscribeToVoices(onChange: (voices: SpeechSynthesisVoice[]) => void): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => {}
  const emit = () => onChange(getSpeechVoices())
  try {
    emit()
    // Some embedded WebKit/Chromium speech implementations expose
    // getVoices() but not EventTarget methods. Preferences must still render
    // in that environment; a voice picker that cannot refresh is a degraded
    // control, not a reason to crash the whole settings page.
    if (typeof window.speechSynthesis.addEventListener !== "function") return () => {}
    window.speechSynthesis.addEventListener("voiceschanged", emit)
    return () => {
      try {
        window.speechSynthesis.removeEventListener?.("voiceschanged", emit)
      } catch {
        /* engine disappeared during page teardown */
      }
    }
  } catch {
    return () => {}
  }
}

/** Voices that can actually read the given BCP-47 tag, matched on the language
 *  subtag so an `en-GB` voice still qualifies for `en-US`. Sorted by name so
 *  the list — and any fallback taken from it — is identical every time. */
export function voicesForLanguage(voices: SpeechSynthesisVoice[], language: string): SpeechSynthesisVoice[] {
  const base = language.slice(0, 2).toLowerCase()
  return voices
    .filter((voice) => voice.lang.replace("_", "-").toLowerCase().startsWith(base))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * macOS's gimmick voices — sound effects and comedy turns, not readers.
 *
 * **This list is the fix for a real report of "the voices are really bad".**
 * Every one of these reports `lang: "en-US"` exactly like Samantha does, and
 * the engine exposes no quality field to tell them apart, so a picker sorted
 * by name put **Albert** — a deliberately croaky joke voice — first among 28
 * en-US voices and offered it as the default. It was chosen, saved, and read
 * every answer aloud. Nothing about that was detectable from the API.
 *
 * Deprioritised, NOT filtered out: they stay pickable for anyone who wants
 * Zarvox on purpose, and on a machine whose only English voice is a novelty
 * one, speaking in it still beats silence.
 *
 * Best-effort by design. Apple localises some of these names, so on a
 * non-English system a few will slip through — which is why the ranking below
 * does not lean on this list alone.
 */
export const NOVELTY_VOICES: ReadonlySet<string> = new Set([
  "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos",
  "Deranged", "Good News", "Hysterical", "Jester", "Organ", "Pipe Organ",
  "Princess", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox",
])

/** Real speech, but the 1990s MacinTalk generation of it — intelligible and
 *  robotic. Above the novelty voices, below anything modern. */
const LEGACY_VOICES: ReadonlySet<string> = new Set([
  "Agnes", "Bruce", "Fred", "Junior", "Kathy", "Ralph", "Vicki", "Victoria",
])

export function isNoveltyVoice(voice: SpeechSynthesisVoice): boolean {
  return NOVELTY_VOICES.has(voice.name.trim())
}

/**
 * How good a voice is likely to be, since no engine will tell us.
 *
 * Reads the name, because that is the only quality signal exposed anywhere in
 * the API: Apple's downloadable neural voices are the same names suffixed
 * `(Enhanced)`/`(Premium)`, and Chrome's network voices are prefixed with
 * their vendor. Higher wins.
 */
function voiceScore(voice: SpeechSynthesisVoice, language: string): number {
  const name = voice.name.trim()
  let score = 0
  // Apple's downloadable neural voices — the best thing available offline, and
  // free. Absent until the user installs one, which is what the setup form now
  // points them at.
  if (/\((?:enhanced|premium)\)/i.test(name)) score += 40
  // Vendor-hosted modern engines: "Google US English", "Microsoft Aria Online
  // (Natural)". Present in Chrome, absent in this app's own Electron shell.
  else if (/^(?:google|microsoft)\b/i.test(name) || /\bnatural\b/i.test(name)) score += 20
  // The engine's own default is the platform's opinion of its best general
  // voice, and on macOS it is Samantha rather than anything on either list.
  if (voice.default) score += 8
  if (voice.lang.replace("_", "-").toLowerCase() === language.toLowerCase()) score += 4
  if (NOVELTY_VOICES.has(name)) score -= 1000
  else if (LEGACY_VOICES.has(name)) score -= 10
  return score
}

/**
 * The one place a voice is chosen, used by the assistant and by the settings
 * preview so the two can never disagree about what "your voice" means.
 *
 * **Every branch is deterministic.** An earlier version ended at `matches[0]`
 * on the raw `getVoices()` order, which no engine promises to keep stable, so
 * the fallback could differ run to run on the same machine. Ordering is
 * imposed here instead — by quality first, then by name, never by the order
 * the engine happened to report.
 */
/**
 * Best first, for a picker — same scoring the automatic choice uses, so the
 * top of the list and the automatic pick can never disagree.
 *
 * Sorted from the already-name-sorted `voicesForLanguage` and `sort` is
 * stable, so equal-quality voices stay alphabetical.
 */
export function sortVoicesByQuality(
  voices: SpeechSynthesisVoice[],
  language: string
): SpeechSynthesisVoice[] {
  return [...voices].sort((a, b) => voiceScore(b, language) - voiceScore(a, language))
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI: string | undefined,
  language: string
): SpeechSynthesisVoice | undefined {
  // An explicit choice wins outright, in any language: someone who picked a
  // voice meant it, and silently overriding it when the reply language moves
  // is how a setting stops being believed.
  //
  // **The one exception is a novelty voice, and it is a repair rather than an
  // override.** The picker used to offer Albert as its pre-selected default,
  // so a saved gimmick voice is at least as likely to be a form nobody
  // changed as a preference — and the report that prompted this had exactly
  // that value on disk. Fixing only the ranking would leave every existing
  // install still reading answers in a joke voice, which is v91's rule: a
  // fixed template does not fix the copies already made. Re-picking one here
  // heals them with no visit to Settings. Choosing one deliberately still
  // works — it survives, because the picker no longer hands it out by default.
  if (voiceURI) {
    const chosen = voices.find((voice) => voice.voiceURI === voiceURI)
    if (chosen && !isNoveltyVoice(chosen)) return chosen
  }
  const matches = voicesForLanguage(voices, language)
  if (matches.length === 0) return undefined
  // `voicesForLanguage` already sorted by name, and sort is stable — so equal
  // scores keep that order and the result is identical on every run.
  return sortVoicesByQuality(matches, language)[0]
}
