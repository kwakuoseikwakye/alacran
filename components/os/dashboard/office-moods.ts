/**
 * The office's two looks, chosen by the app's theme: "light" is the Sunlit studio,
 * "dark" is After hours. Data only (no three import), so the card can read it
 * without loading the 3D code. Values were tuned in the art-direction prototype.
 */
export type MoodName = "light" | "dark"

export type Mood = {
  name: MoodName
  exposure: number
  floor: { base: string; alt: string; seam: string }
  slab: { side: string; thickness: number; shadow: number }
  wall: string
  trim: string
  glassOpacity: number
  /** Night windows glow with the sky; null in daylight. */
  glassGlow: string | null
  partition: { frame: string; glass: string; glassOpacity: number; base: string }
  /** Kenney material name → colour. */
  materials: Record<string, string>
  corridor: string
  sofa: string
  loungeRug: string
  kitchenRug: string
  youRug: string
  hotAccent: string
  /** How much of a room's colour tints its rug. */
  rugMix: number
  art: string[]
  hemi: [string, string, number]
  sun: { color: string; intensity: number; shadow: number; at: [number, number, number] }
  night: boolean
  bloom: { strength: number; radius: number; threshold: number } | null
  screenOff: string
  /** How much brighter a working screen is than white; above 1 it blooms at night. */
  screenBoost: number
  /** Night signs are unlit and bloom; this keeps their text readable. */
  signGain: number
}

export const MOODS: Record<MoodName, Mood> = {
  light: {
    name: "light",
    exposure: 1.02,
    floor: { base: "#ecd8b6", alt: "#e4cba4", seam: "#cfb18a" },
    slab: { side: "#b98f62", thickness: 0.3, shadow: 0.26 },
    wall: "#fbf7f1",
    trim: "#c89462",
    glassOpacity: 0.6,
    glassGlow: null,
    partition: { frame: "#ffffff", glass: "#cfe8f3", glassOpacity: 0.22, base: "#f3ece2" },
    materials: {
      wood: "#c99566",
      woodDark: "#9c6c45",
      metal: "#d5dbde",
      metalDark: "#39434d",
      metalMedium: "#6d7b82",
      metalLight: "#f4f6f5",
      _defaultMat: "#fbf7f1",
      carpet: "#e07a5f",
      carpetDarker: "#e07a5f",
      carpetBlue: "#3f8f86",
      carpetWhite: "#ffffff",
      plant: "#2f9e62",
      lamp: "#ffe7b0",
      glass: "#d6ecf6",
    },
    corridor: "#e0caa8",
    sofa: "#3f8f86",
    loungeRug: "#f0dcc2",
    kitchenRug: "#e6d6c2",
    youRug: "#f6dfb2",
    hotAccent: "#8a94a6",
    rugMix: 0.3,
    art: ["#3f7cf5", "#f2a65a", "#ec4f88", "#2f9e62"],
    hemi: ["#fff6ea", "#c2ab8c", 1.25],
    sun: { color: "#ffe2bd", intensity: 3.0, shadow: 0.82, at: [-7, 12, 6] },
    night: false,
    bloom: null,
    screenOff: "#2a2f38",
    screenBoost: 1,
    signGain: 1,
  },
  dark: {
    name: "dark",
    exposure: 1.1,
    floor: { base: "#2c3253", alt: "#292f4e", seam: "#20253f" },
    slab: { side: "#151a2f", thickness: 0.3, shadow: 0.55 },
    wall: "#3a4266",
    trim: "#59638f",
    glassOpacity: 0.95,
    glassGlow: "#2b4a9a",
    partition: { frame: "#5b6592", glass: "#6f8cff", glassOpacity: 0.12, base: "#2f3656" },
    materials: {
      wood: "#7d5743",
      woodDark: "#5a3c2e",
      metal: "#8e98b8",
      metalDark: "#1f2539",
      metalMedium: "#4c5677",
      metalLight: "#c7cde3",
      _defaultMat: "#3a4266",
      carpet: "#a34d6e",
      carpetDarker: "#a34d6e",
      carpetBlue: "#4553a0",
      carpetWhite: "#c7cde3",
      plant: "#2f8f6a",
      lamp: "#ffd27a",
      glass: "#1d2c5a",
    },
    corridor: "#323a5e",
    sofa: "#4553a0",
    loungeRug: "#3b3663",
    kitchenRug: "#30375a",
    youRug: "#46395c",
    hotAccent: "#5b6592",
    rugMix: 0.34,
    art: ["#4da3ff", "#ffb86b", "#ff5fa2", "#57d9a3"],
    hemi: ["#8391ea", "#0b0d18", 0.55],
    sun: { color: "#a9bbff", intensity: 0.6, shadow: 0.55, at: [-7, 12, 6] },
    night: true,
    bloom: { strength: 0.62, radius: 0.45, threshold: 0.86 },
    screenOff: "#10131d",
    screenBoost: 2.4,
    signGain: 0.72,
  },
}

/** The app stamps data-theme="light" | "dark" on <html>; anything but light is the night office. */
export function moodFor(theme: string | undefined): MoodName {
  return theme === "light" ? "light" : "dark"
}
