import { DEFAULT_MAX_CALL_MINUTES } from "./call-guard"
import { DEFAULT_PALETTE, PALETTE_IDS, type PaletteId } from "./nexus-model"

export type AgentPrefs = {
  /** null = follow the operating system's reduced-motion setting. */
  calm: boolean | null
  highContrast: boolean
  textScale: 1 | 1.25 | 1.5
  maxMinutes: number
  /** The orb's spectrum. Photon cyan unless the owner picked another. */
  palette: PaletteId
}

export const DEFAULT_PREFS: AgentPrefs = {
  calm: null,
  highContrast: false,
  textScale: 1,
  maxMinutes: DEFAULT_MAX_CALL_MINUTES,
  palette: DEFAULT_PALETTE,
}

const MAX_MINUTES_CEILING = 60

export function parsePrefs(raw: string | null): AgentPrefs {
  if (!raw) return DEFAULT_PREFS
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return DEFAULT_PREFS
  }
  if (typeof value !== "object" || value === null) return DEFAULT_PREFS
  const v = value as Record<string, unknown>
  const minutes = typeof v.maxMinutes === "number" && Number.isFinite(v.maxMinutes) ? Math.floor(v.maxMinutes) : 0
  return {
    calm: typeof v.calm === "boolean" ? v.calm : null,
    highContrast: v.highContrast === true,
    textScale: v.textScale === 1.25 || v.textScale === 1.5 ? v.textScale : 1,
    palette: PALETTE_IDS.includes(v.palette as PaletteId) ? (v.palette as PaletteId) : DEFAULT_PALETTE,
    maxMinutes: minutes >= 1 ? Math.min(minutes, MAX_MINUTES_CEILING) : DEFAULT_MAX_CALL_MINUTES,
  }
}

export function resolveCalm(prefs: AgentPrefs, osReducedMotion: boolean): boolean {
  return prefs.calm ?? osReducedMotion
}
