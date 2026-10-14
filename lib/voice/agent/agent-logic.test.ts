import { describe, expect, it } from "vitest"
import { deriveDisplay, orbMode } from "./agent-state"
import { DEFAULT_MAX_CALL_MINUTES, SILENCE_LIMIT_MS, callShouldEnd } from "./call-guard"
import { DEFAULT_PREFS, parsePrefs, resolveCalm } from "./agent-preferences"

const base = { connection: "connected", mode: "listening", toolRunning: false, awaitingReply: false } as const

describe("deriveDisplay", () => {
  it("shows the tool running as checking, ahead of everything else", () => {
    expect(deriveDisplay({ ...base, mode: "speaking", toolRunning: true })).toBe("checking")
  })
  it("shows speaking, listening, and thinking (user finished, agent not yet speaking)", () => {
    expect(deriveDisplay({ ...base, mode: "speaking" })).toBe("speaking")
    expect(deriveDisplay(base)).toBe("listening")
    expect(deriveDisplay({ ...base, awaitingReply: true })).toBe("thinking")
  })
  it("maps connection states", () => {
    expect(deriveDisplay({ ...base, connection: "idle" })).toBe("idle")
    expect(deriveDisplay({ ...base, connection: "ended" })).toBe("idle")
    expect(deriveDisplay({ ...base, connection: "connecting" })).toBe("connecting")
    expect(deriveDisplay({ ...base, connection: "reconnecting" })).toBe("reconnecting")
  })
  it("has an orb mode for every display", () => {
    for (const d of ["idle", "connecting", "listening", "thinking", "speaking", "checking", "reconnecting"] as const) {
      expect(["idle", "listening", "thinking", "speaking"]).toContain(orbMode(d))
    }
    expect(orbMode("checking")).toBe("thinking")
  })
})

describe("callShouldEnd", () => {
  const t0 = 1_000_000
  it("keeps going while there was recent activity", () => {
    expect(callShouldEnd({ startedAt: t0, lastActivityAt: t0 + 60_000, now: t0 + 90_000, maxMinutes: 10 })).toBeNull()
  })
  it("ends after 2 minutes of silence", () => {
    expect(
      callShouldEnd({ startedAt: t0, lastActivityAt: t0, now: t0 + SILENCE_LIMIT_MS, maxMinutes: 10 })
    ).toBe("silence")
  })
  it("ends at the maximum length even with constant activity, and that wins over silence", () => {
    const now = t0 + DEFAULT_MAX_CALL_MINUTES * 60_000
    expect(callShouldEnd({ startedAt: t0, lastActivityAt: now - 1, now, maxMinutes: DEFAULT_MAX_CALL_MINUTES })).toBe(
      "max-length"
    )
    expect(callShouldEnd({ startedAt: t0, lastActivityAt: t0, now, maxMinutes: DEFAULT_MAX_CALL_MINUTES })).toBe(
      "max-length"
    )
  })
})

describe("preferences", () => {
  it("falls back to defaults for null, junk, or the wrong types", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(JSON.stringify({ calm: "yes", textScale: 9, maxMinutes: -3 }))).toEqual(DEFAULT_PREFS)
  })
  it("keeps valid values and clamps the call length", () => {
    const p = parsePrefs(JSON.stringify({ calm: true, highContrast: true, textScale: 1.5, maxMinutes: 30 }))
    expect(p).toEqual({ calm: true, highContrast: true, textScale: 1.5, maxMinutes: 30, palette: "photon" })
    expect(parsePrefs(JSON.stringify({ maxMinutes: 9999 })).maxMinutes).toBe(60)
    expect(parsePrefs(JSON.stringify({ maxMinutes: 0 })).maxMinutes).toBe(DEFAULT_MAX_CALL_MINUTES)
  })
  it("drops the old push-to-talk setting saved by earlier versions", () => {
    expect(parsePrefs(JSON.stringify({ pushToTalk: false }))).toEqual(DEFAULT_PREFS)
  })
  it("calm follows the operating system until the owner chooses, then the owner wins", () => {
    expect(resolveCalm({ ...DEFAULT_PREFS, calm: null }, true)).toBe(true)
    expect(resolveCalm({ ...DEFAULT_PREFS, calm: null }, false)).toBe(false)
    expect(resolveCalm({ ...DEFAULT_PREFS, calm: false }, true)).toBe(false)
    expect(resolveCalm({ ...DEFAULT_PREFS, calm: true }, false)).toBe(true)
  })
})
