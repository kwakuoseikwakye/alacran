/**
 * Double-clap detection over a stream of loudness readings. Pure: no audio, no timers, no DOM, so it
 * is testable with plain numbers. `use-clap-wake.ts` feeds it from the microphone.
 *
 * A clap is a short spike well above the room's own noise. Three things keep it from firing on
 * everything else:
 *  - the bar is relative (a multiple of a slowly-following noise floor, never below MIN_RMS), so a
 *    quiet room and a noisy one both work and silence never counts;
 *  - a spike that lasts longer than MAX_CLAP_MS is speech or a machine, not a hand, and is discarded;
 *  - two claps must be a deliberate gap apart: not one thump heard twice, not two unrelated sounds.
 *
 * The constants are measured against synthetic signals only. They are the calibration knob: a real
 * microphone's gain and a real room will want them nudged, which is why they are overridable.
 */

/** How often the caller should push a reading. */
export const BLOCK_MS = 20

export type ClapOptions = {
  /** A reading counts as a spike above this many times the noise floor. */
  spikeRatio: number
  /** ...and never below this absolute loudness (RMS, 0..1), so a silent room cannot trigger. */
  minRms: number
  /** A spike longer than this is not a clap. */
  maxClapMs: number
  /** Claps closer together than this are one clap; further apart than maxGapMs are two separate events. */
  minGapMs: number
  maxGapMs: number
  /** After waking, ignore everything for this long (the rest of a clapping burst, and the app's own sounds). */
  lockoutMs: number
}

export const DEFAULT_CLAP_OPTIONS: ClapOptions = {
  spikeRatio: 6,
  minRms: 0.04,
  maxClapMs: 150,
  minGapMs: 120,
  maxGapMs: 700,
  lockoutMs: 1500,
}

// How fast the noise floor follows the room. Quickly when it is quiet, barely at all during a spike, so a
// clap cannot raise its own bar but a room that really got louder is caught up with.
const FLOOR_FOLLOW = 0.05
const FLOOR_FOLLOW_LOUD = 0.002

export function createClapDetector(overrides: Partial<ClapOptions> = {}) {
  const o = { ...DEFAULT_CLAP_OPTIONS, ...overrides }
  let floor: number | null = null
  let aboveSince: number | null = null
  let sustained = false
  let lastClapAt: number | null = null
  let lockedUntil = -Infinity

  return {
    /** One loudness reading (RMS 0..1) at time `t` in ms. True when a double clap has just completed. */
    push(rms: number, t: number): boolean {
      if (floor === null) floor = rms
      const threshold = Math.max(o.minRms, floor * o.spikeRatio)
      const above = rms > threshold
      floor += (rms - floor) * (above ? FLOOR_FOLLOW_LOUD : FLOOR_FOLLOW)

      if (t < lockedUntil) {
        aboveSince = null
        return false
      }

      if (above) {
        if (aboveSince === null) {
          aboveSince = t
          sustained = false
        } else if (t - aboveSince > o.maxClapMs) {
          sustained = true
        }
        return false
      }

      // Falling edge: a spike just ended.
      if (aboveSince === null) return false
      const onset = aboveSince
      const wasClap = !sustained && t - onset <= o.maxClapMs
      aboveSince = null
      if (!wasClap) return false

      if (lastClapAt !== null) {
        const gap = onset - lastClapAt
        if (gap < o.minGapMs) return false // the same thump
        if (gap <= o.maxGapMs) {
          lastClapAt = null
          lockedUntil = t + o.lockoutMs
          return true
        }
      }
      lastClapAt = onset
      return false
    },
  }
}
