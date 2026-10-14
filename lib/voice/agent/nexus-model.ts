import { orbMode, type AgentDisplay } from "./agent-state"

/** The orb's four states. Every agent display maps onto one of them through `orbMode`. */
export type NexusState = ReturnType<typeof orbMode>
export type PaletteId = "solar" | "photon" | "ion"
type Rgb = [number, number, number]

/**
 * The full layout's breakpoint, measured on the dock's own width, not the window.
 * app/globals.css repeats it in its `@container nexus` rule: change both together.
 */
export const NEXUS_WIDE_PX = 820

/** From the owner's reference design. `a` and `b` are the orb's two colours, 0..1. */
export const NEXUS_PALETTES: Record<PaletteId, { name: string; hex: string; rgb: string; a: Rgb; b: Rgb }> = {
  solar: { name: "Solar", hex: "#f0c28a", rgb: "240,194,138", a: [1, 0.7, 0.33], b: [0.9, 0.3, 0.1] },
  photon: { name: "Photon", hex: "#89efff", rgb: "137,239,255", a: [0.19, 0.85, 1], b: [0.16, 0.34, 1] },
  ion: { name: "Ion", hex: "#c8a4ff", rgb: "200,164,255", a: [0.72, 0.44, 1], b: [0.3, 0.68, 1] },
}
export const PALETTE_IDS: PaletteId[] = ["solar", "photon", "ion"]
export const DEFAULT_PALETTE: PaletteId = "photon"

export type NexusCopy = { eyebrow: string; title: string; copy: string; presence: string; footer: string }

const COPY: Record<NexusState | "waking", NexusCopy> = {
  idle: { eyebrow: "STANDING BY", title: "Ready when\nyou are.", copy: "A quiet presence.\nA spark of possibility.", presence: "Presence online", footer: "Ready" },
  waking: { eyebrow: "WAKING UP", title: "One moment.", copy: "Getting ready to listen.", presence: "Waking up", footer: "Waking up" },
  listening: { eyebrow: "TUNING IN", title: "You have my\nattention.", copy: "Every word has a rhythm.\nI’m here for yours.", presence: "Listening", footer: "Listening" },
  thinking: { eyebrow: "CONNECTING THE DOTS", title: "An idea is\ntaking shape.", copy: "Following the threads.\nFinding a little clarity.", presence: "Thinking", footer: "Thinking" },
  speaking: { eyebrow: "A THOUGHT TO SHARE", title: "Let’s find\na way forward.", copy: "A little perspective.\nA new possibility.", presence: "Speaking", footer: "Speaking" },
}

/** The words for what the assistant is doing. Connecting reads as waking up; a lookup and a reconnect say so in the pill. */
export function nexusCopy(display: AgentDisplay): NexusCopy {
  if (display === "connecting") return COPY.waking
  const base = COPY[orbMode(display)]
  if (display === "checking") return { ...base, presence: "Checking your company" }
  if (display === "reconnecting") return { ...base, presence: "Reconnecting" }
  return base
}

export const PRESENCE_MODES: { id: NexusState; name: string; desc: string }[] = [
  { id: "idle", name: "Idle", desc: "Quietly aware" },
  { id: "listening", name: "Listening", desc: "Attuned to you" },
  { id: "thinking", name: "Thinking", desc: "Finding a thread" },
  { id: "speaking", name: "Speaking", desc: "An idea takes shape" },
]

export const SUGGESTIONS = ["Brief me", "Set up my company", "Check my messages"] as const

export function wordmark(name: string): string {
  return (name.trim() || "Assistant").toUpperCase()
}

export function greeting(name: string): string {
  return `Hello. I’m ${name.trim() || "your assistant"}. What’s on your mind?`
}
