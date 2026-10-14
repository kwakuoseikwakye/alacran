import { describe, expect, it } from "vitest"
import {
  DEFAULT_PALETTE, NEXUS_PALETTES, PALETTE_IDS, PRESENCE_MODES, SUGGESTIONS, greeting, nexusCopy, wordmark,
} from "./nexus-model"
import { DEFAULT_PREFS, parsePrefs } from "./agent-preferences"
import type { AgentDisplay } from "./agent-state"

const ALL: AgentDisplay[] = ["idle", "connecting", "listening", "thinking", "speaking", "checking", "reconnecting"]

describe("nexusCopy", () => {
  it("uses the reference design's words for each state, and waking up while it connects", () => {
    expect(nexusCopy("idle")).toMatchObject({ eyebrow: "STANDING BY", title: "Ready when\nyou are.", presence: "Presence online", footer: "Ready" })
    expect(nexusCopy("connecting")).toMatchObject({ eyebrow: "WAKING UP", title: "One moment.", copy: "Getting ready to listen.", presence: "Waking up" })
    expect(nexusCopy("listening")).toMatchObject({ eyebrow: "TUNING IN", title: "You have my\nattention.", presence: "Listening" })
    expect(nexusCopy("thinking")).toMatchObject({ eyebrow: "CONNECTING THE DOTS", title: "An idea is\ntaking shape.", presence: "Thinking" })
    expect(nexusCopy("speaking")).toMatchObject({ eyebrow: "A THOUGHT TO SHARE", title: "Let’s find\na way forward.", presence: "Speaking" })
  })
  it("says in the pill when it is checking the company or reconnecting", () => {
    expect(nexusCopy("checking")).toMatchObject({ eyebrow: "CONNECTING THE DOTS", presence: "Checking your company" })
    expect(nexusCopy("reconnecting")).toMatchObject({ eyebrow: "CONNECTING THE DOTS", presence: "Reconnecting" })
  })
  it("never says call", () => {
    for (const d of ALL) for (const v of Object.values(nexusCopy(d))) expect(v).not.toMatch(/\bcall/i)
  })
})

describe("palettes", () => {
  it("has the reference's three spectra, with Photon cyan as the default", () => {
    expect(PALETTE_IDS).toEqual(["solar", "photon", "ion"])
    expect(NEXUS_PALETTES.solar).toMatchObject({ name: "Solar", hex: "#f0c28a", rgb: "240,194,138" })
    expect(NEXUS_PALETTES.photon).toMatchObject({ name: "Photon", hex: "#89efff", rgb: "137,239,255", a: [0.19, 0.85, 1], b: [0.16, 0.34, 1] })
    expect(NEXUS_PALETTES.ion).toMatchObject({ name: "Ion", hex: "#c8a4ff", rgb: "200,164,255" })
    expect(DEFAULT_PALETTE).toBe("photon")
  })
  it("is remembered in the agent preferences and falls back to Photon", () => {
    expect(DEFAULT_PREFS.palette).toBe("photon")
    expect(parsePrefs(JSON.stringify({ palette: "ion" })).palette).toBe("ion")
    expect(parsePrefs(JSON.stringify({ palette: "neon" })).palette).toBe("photon")
    expect(parsePrefs(null).palette).toBe("photon")
  })
})

describe("names and words", () => {
  it("writes the assistant's own name as the wordmark", () => {
    expect(wordmark("Jarvis")).toBe("JARVIS")
    expect(wordmark("  ")).toBe("ASSISTANT")
  })
  it("greets with the assistant's name", () => {
    expect(greeting("Jarvis")).toBe("Hello. I’m Jarvis. What’s on your mind?")
  })
  it("lists the four presence states and three suggestions", () => {
    expect(PRESENCE_MODES.map((m) => [m.id, m.name, m.desc])).toEqual([
      ["idle", "Idle", "Quietly aware"],
      ["listening", "Listening", "Attuned to you"],
      ["thinking", "Thinking", "Finding a thread"],
      ["speaking", "Speaking", "An idea takes shape"],
    ])
    expect(SUGGESTIONS).toEqual(["Brief me", "Set up my company", "Check my messages"])
  })
})
