import { describe, expect, it } from "vitest"
import { BLOCK_MS, createClapDetector } from "./clap-detector"

/** Feed a sequence of (rms, duration in ms) segments in BLOCK_MS steps; returns the time of each wake. */
function run(segments: [rms: number, ms: number][], start = 0): number[] {
  const detector = createClapDetector()
  const wakes: number[] = []
  let t = start
  for (const [rms, ms] of segments) {
    for (let elapsed = 0; elapsed < ms; elapsed += BLOCK_MS) {
      t += BLOCK_MS
      if (detector.push(rms, t)) wakes.push(t)
    }
  }
  return wakes
}

const ROOM = 0.004 // a quiet room
const CLAP = 0.35
const quiet = (ms: number): [number, number] => [ROOM, ms]
const clap = (): [number, number] => [CLAP, 60]

describe("createClapDetector", () => {
  it("wakes on two sharp claps close together", () => {
    expect(run([quiet(1500), clap(), quiet(300), clap(), quiet(500)])).toHaveLength(1)
  })

  it("does not wake on one clap", () => {
    expect(run([quiet(1500), clap(), quiet(2000)])).toEqual([])
  })

  it("does not wake when the claps are too far apart", () => {
    expect(run([quiet(1500), clap(), quiet(1200), clap(), quiet(500)])).toEqual([])
  })

  it("does not wake when the claps are on top of each other (one thump, not two)", () => {
    expect(run([quiet(1500), clap(), quiet(40), clap(), quiet(500)])).toEqual([])
  })

  it("does not wake on someone talking: loud, but sustained", () => {
    // Speech is several times the room level for seconds, with short dips that look like gaps.
    const speech: [number, number][] = []
    for (let i = 0; i < 8; i++) speech.push([0.12, 400], [0.05, 100])
    expect(run([quiet(1500), ...speech, quiet(500)])).toEqual([])
  })

  it("does not wake on a sustained loud noise such as a vacuum cleaner", () => {
    expect(run([quiet(1500), [0.2, 5000], quiet(500)])).toEqual([])
  })

  it("still hears claps in a noisy room, once the floor has adapted to it", () => {
    const noisy = 0.03
    expect(run([[noisy, 3000], [0.5, 60], [noisy, 300], [0.5, 60], [noisy, 500]])).toHaveLength(1)
  })

  it("ignores a faint double tap below the minimum level, even in a near-silent room", () => {
    // 0.0005 * 6 is far below the tap, so only the absolute floor stands between a rustle and a wake.
    const silent: [number, number] = [0.0005, 1500]
    expect(run([silent, [0.01, 60], [0.0005, 300], [0.01, 60], [0.0005, 500]])).toEqual([])
  })

  it("wakes once for a burst of claps, not once per pair", () => {
    expect(run([quiet(1500), clap(), quiet(250), clap(), quiet(250), clap(), quiet(250), clap(), quiet(500)])).toHaveLength(1)
  })

  it("can wake again after the lockout", () => {
    const wakes = run([quiet(1500), clap(), quiet(250), clap(), quiet(3000), clap(), quiet(250), clap(), quiet(500)])
    expect(wakes).toHaveLength(2)
  })
})
