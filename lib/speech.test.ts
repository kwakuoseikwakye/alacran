import { afterEach, describe, expect, it, vi } from "vitest"
import { isNoveltyVoice, pickVoice, voicesForLanguage } from "./speech"

/**
 * A fresh copy per test, because the "this engine already failed" memo is
 * module state on purpose (see lib/speech.ts) — importing once would leak one
 * test's failure into the next.
 */
async function freshSpeech() {
  vi.resetModules()
  return import("./speech")
}

/** vitest runs in a node environment, so there is no `window` unless one is set. */
function withWindow(value: unknown) {
  ;(globalThis as { window?: unknown }).window = value
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe("classifySpeechError", () => {
  it("calls the speech service being unreachable what it is, not a mishearing", async () => {
    const { classifySpeechError } = await freshSpeech()
    // `network` is what the packaged mac shell actually produces — measured
    // against Electron 42.10.1 with the microphone granted. It used to share a
    // message with a genuine mishearing, which is the whole bug.
    for (const error of ["network", "service-not-allowed", "service-not-available"]) {
      expect(classifySpeechError(error)).toBe("no-engine")
    }
  })

  it("keeps not-allowed and service-not-allowed apart", async () => {
    const { classifySpeechError } = await freshSpeech()
    // One hyphenated word apart, opposite problems: the user refused the
    // microphone, versus the machine has no speech service. Same rule v142
    // wrote for Deepgram's 401 vs 403.
    expect(classifySpeechError("not-allowed")).toBe("microphone")
    expect(classifySpeechError("service-not-allowed")).toBe("no-engine")
  })

  it("treats a missing input device as a microphone problem", async () => {
    const { classifySpeechError } = await freshSpeech()
    expect(classifySpeechError("audio-capture")).toBe("microphone")
  })

  it("treats silence and our own stop as nothing to report", async () => {
    const { classifySpeechError } = await freshSpeech()
    expect(classifySpeechError("no-speech")).toBe("silence")
    expect(classifySpeechError("aborted")).toBe("silence")
  })

  it("falls back to unclear for an error string nobody has seen", async () => {
    const { classifySpeechError } = await freshSpeech()
    expect(classifySpeechError("bad-grammar")).toBe("unclear")
    expect(classifySpeechError(undefined)).toBe("unclear")
    expect(classifySpeechError("")).toBe("unclear")
  })
})

describe("speechFailureMessage", () => {
  it("sends a dead engine to the two things that do work", async () => {
    const { speechFailureMessage } = await freshSpeech()
    const { caption, next } = speechFailureMessage("no-engine")
    expect(caption).toContain("no working speech engine")
    // Never blames the microphone, which is the lie the old copy told.
    expect(caption).not.toMatch(/did not catch|microphone/i)
    expect(next).toMatch(/type/i)
    expect(next).toMatch(/deepgram/i)
  })

  it("points a real refusal at the microphone and nowhere else", async () => {
    const { speechFailureMessage } = await freshSpeech()
    const { caption, next } = speechFailureMessage("microphone")
    expect(caption).toMatch(/microphone/i)
    expect(next).toMatch(/type/i)
    expect(next).not.toMatch(/deepgram/i)
  })

  it("still says 'did not catch that' only when that is what happened", async () => {
    const { speechFailureMessage } = await freshSpeech()
    expect(speechFailureMessage("unclear").caption).toBe("Did not catch that.")
  })

  it("says nothing at all about silence — callers return before showing it", async () => {
    const { speechFailureMessage } = await freshSpeech()
    expect(speechFailureMessage("silence")).toEqual({ caption: "", next: "" })
  })

  it("never tells a user to look 'below', since the two surfaces differ", async () => {
    const { speechFailureMessage } = await freshSpeech()
    for (const failure of ["no-engine", "microphone", "unclear"] as const) {
      expect(speechFailureMessage(failure).next).not.toMatch(/below|above/i)
    }
  })
})

describe("getSpeechRecognition", () => {
  it("is undefined with no window at all — the server render must not throw", async () => {
    const { getSpeechRecognition } = await freshSpeech()
    expect(getSpeechRecognition()).toBeUndefined()
  })

  it("is undefined where the constructor is genuinely absent", async () => {
    const { getSpeechRecognition } = await freshSpeech()
    withWindow({})
    expect(getSpeechRecognition()).toBeUndefined()
  })

  it("prefers the unprefixed constructor, which Chromium now also ships", async () => {
    const { getSpeechRecognition } = await freshSpeech()
    const unprefixed = function () {}
    const prefixed = function () {}
    withWindow({ SpeechRecognition: unprefixed, webkitSpeechRecognition: prefixed })
    expect(getSpeechRecognition()).toBe(unprefixed)
  })

  it("still hands out the vendor-prefixed one when it is all there is", async () => {
    const { getSpeechRecognition } = await freshSpeech()
    const prefixed = function () {}
    withWindow({ webkitSpeechRecognition: prefixed })
    expect(getSpeechRecognition()).toBe(prefixed)
  })

  it("stops handing out a constructor that has already failed at use time", async () => {
    const { getSpeechRecognition, markSpeechEngineBroken, isSpeechEngineBroken } = await freshSpeech()
    // Exactly the packaged mac shell: the constructor is present, so presence
    // detection passes, and the service behind it does not exist.
    withWindow({ webkitSpeechRecognition: function () {} })
    expect(getSpeechRecognition()).toBeDefined()
    expect(isSpeechEngineBroken()).toBe(false)

    markSpeechEngineBroken()

    expect(isSpeechEngineBroken()).toBe(true)
    // Every caller already copes with an absent engine, so it now copes with a
    // dead one for free — and the second press fails honestly rather than
    // identically.
    expect(getSpeechRecognition()).toBeUndefined()
  })

  it("does not leak one window's failure into the next page load", async () => {
    const first = await freshSpeech()
    withWindow({ webkitSpeechRecognition: function () {} })
    first.markSpeechEngineBroken()
    expect(first.getSpeechRecognition()).toBeUndefined()

    const second = await freshSpeech()
    expect(second.isSpeechEngineBroken()).toBe(false)
    expect(second.getSpeechRecognition()).toBeDefined()
  })
})

describe("subscribeToVoices", () => {
  it("does not crash Preferences when an embedded engine has getVoices but no EventTarget API", async () => {
    const { subscribeToVoices } = await freshSpeech()
    const voices = [{ name: "System Voice" }]
    withWindow({ speechSynthesis: { getVoices: () => voices } })
    const seen: unknown[] = []

    const unsubscribe = subscribeToVoices((next) => seen.push(next))

    expect(seen).toEqual([voices])
    expect(() => unsubscribe()).not.toThrow()
  })
})

/* ---------------------------------------------------------------------------
   Restored: v147's voice-ranking coverage.

   This slice rewrote the file around the new failure classification and took
   these with it. The suite stayed green at the same total — 16 new tests
   replaced 16 old ones — which is exactly the shape of a coverage loss nobody
   notices. These pin the macOS joke-voice bug shut (`Albert` is first
   alphabetically out of 28 en-US voices, and was being picked), so losing them
   silently re-opens a bug a real user reported.
   --------------------------------------------------------------------------- */

const voice = (name: string, lang: string, isDefault = false) =>
  ({ name, lang, voiceURI: `urn:${name}`, default: isDefault }) as SpeechSynthesisVoice

const DANIEL = voice("Daniel", "en-GB")
const SAMANTHA = voice("Samantha", "en-US", true)
const ALEX = voice("Alex", "en-US")
const KYOKO = voice("Kyoko", "ja-JP")

describe("voicesForLanguage", () => {
  it("matches on the language subtag, so an en-GB voice serves en-US", () => {
    expect(voicesForLanguage([DANIEL, KYOKO], "en-US")).toEqual([DANIEL])
  })

  it("tolerates the underscore some platforms report", () => {
    const underscored = voice("Local", "en_US")
    expect(voicesForLanguage([underscored], "en-US")).toEqual([underscored])
  })
})

describe("pickVoice", () => {
  it("honours an explicit choice", () => {
    expect(pickVoice([DANIEL, SAMANTHA, ALEX], DANIEL.voiceURI, "en-US")).toBe(DANIEL)
  })

  /** Someone who picked a voice meant it. Overriding that when the reply
   *  language moves is how a setting stops being believed. */
  it("keeps an explicit choice even when it doesn't match the reply language", () => {
    expect(pickVoice([DANIEL, KYOKO], KYOKO.voiceURI, "en-US")).toBe(KYOKO)
  })

  it("falls back rather than going silent when the saved voice is gone", () => {
    // Voices disappear between machines and OS updates; a dangling voiceURI
    // must never mean "say nothing".
    expect(pickVoice([DANIEL, SAMANTHA], "urn:UninstalledVoice", "en-US")).toBe(SAMANTHA)
  })

  /**
   * THE regression this module exists for. `getVoices()` promises no ordering,
   * and the previous implementation ended at `matches[0]` on the raw array — so
   * the same machine could answer in a different voice run to run. Every
   * permutation must land on the same voice.
   */
  it("picks the same voice regardless of the order the engine reports", () => {
    const permutations = [
      [DANIEL, SAMANTHA, ALEX],
      [ALEX, DANIEL, SAMANTHA],
      [SAMANTHA, ALEX, DANIEL],
    ]
    const picked = permutations.map((list) => pickVoice(list, "", "en-US")?.name)
    expect(new Set(picked).size).toBe(1)
  })

  it("prefers an exact locale match over a merely compatible one", () => {
    expect(pickVoice([DANIEL, ALEX], "", "en-US")).toBe(ALEX)
  })

  it("returns undefined when nothing can read the language, rather than guessing", () => {
    // The caller then leaves `utterance.voice` unset and the engine's own
    // default reads it — better than a Japanese voice reading English.
    expect(pickVoice([KYOKO], "", "de-DE")).toBeUndefined()
  })
})

describe("voice quality ranking", () => {
  const ALBERT = voice("Albert", "en-US")
  const ZARVOX = voice("Zarvox", "en-US")
  const AVA_PREMIUM = voice("Ava (Premium)", "en-US")
  const GOOGLE = voice("Google US English", "en-US")
  const FRED = voice("Fred", "en-US")
  const EDDY = voice("Eddy (English (US))", "en-US")

  it("knows a gimmick voice from a reader", () => {
    expect(isNoveltyVoice(ALBERT)).toBe(true)
    expect(isNoveltyVoice(ZARVOX)).toBe(true)
    expect(isNoveltyVoice(SAMANTHA)).toBe(false)
    expect(isNoveltyVoice(AVA_PREMIUM)).toBe(false)
  })

  /**
   * THE bug this ranking exists for. Every one of these reports lang "en-US",
   * and sorted by name Albert comes first of 28 — so the old exact-locale
   * branch handed out a joke voice as the default on every Mac.
   */
  it("never hands out a novelty voice when a real one can read the language", () => {
    expect(pickVoice([ALBERT, ZARVOX, SAMANTHA], "", "en-US")).toBe(SAMANTHA)
    // Alphabetically Albert still wins; quality must beat name order.
    expect(pickVoice([ALBERT, EDDY], "", "en-US")).toBe(EDDY)
  })

  it("prefers Apple's downloadable neural voices above everything else", () => {
    expect(pickVoice([SAMANTHA, GOOGLE, AVA_PREMIUM], "", "en-US")).toBe(AVA_PREMIUM)
  })

  it("prefers a vendor-hosted modern voice over a compact one", () => {
    expect(pickVoice([SAMANTHA, GOOGLE], "", "en-US")).toBe(GOOGLE)
  })

  it("ranks 1990s MacinTalk below anything modern, and above a gimmick", () => {
    expect(pickVoice([FRED, EDDY], "", "en-US")).toBe(EDDY)
    expect(pickVoice([FRED, ALBERT], "", "en-US")).toBe(FRED)
  })

  /**
   * The repair half, and the reason this is not just a ranking change: the
   * reported machine had `voiceURI: "Albert"` saved as the user's own choice,
   * put there by a picker that pre-selected it. Ranking alone would leave
   * every such install still speaking in it.
   */
  it("re-picks a saved novelty voice instead of honouring it", () => {
    expect(pickVoice([ALBERT, SAMANTHA], ALBERT.voiceURI, "en-US")).toBe(SAMANTHA)
  })

  it("still honours a deliberate non-novelty choice over a better-ranked voice", () => {
    expect(pickVoice([SAMANTHA, AVA_PREMIUM], SAMANTHA.voiceURI, "en-US")).toBe(SAMANTHA)
  })

  it("speaks in a gimmick voice rather than going silent when it is all there is", () => {
    // The answer is on screen either way, but silence reads as a broken app.
    expect(pickVoice([ALBERT, ZARVOX], "", "en-US")).toBeDefined()
  })
})
