import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildHumanoidModel,
  CORE_R,
  FALLBACK_PALETTE,
  resolveHumanoidPalette,
  type HumanoidPalette,
} from "./animated-particles"

/**
 * The five --asst-avatar-* declarations, read out of the REAL stylesheet.
 *
 * This is the point of the file. `resolveHumanoidPalette` reads these tokens
 * from the DOM at mount, so the token is what ships — asserting on
 * FALLBACK_PALETTE alone would let someone set --asst-avatar-primary to
 * #2ee5ff and watch every test pass while production rendered cyan. Same
 * shape as parse-changelog.test.ts and build-company-ontology.test.ts, which
 * read their real files for the same reason.
 */
function avatarTokens(): Record<string, [number, number, number]> {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8")
  const out: Record<string, [number, number, number]> = {}
  for (const [, name, hex] of css.matchAll(/--asst-avatar-([a-z]+):\s*#([0-9a-fA-F]{6})/g)) {
    const n = parseInt(hex, 16)
    out[name] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  return out
}

describe("the --asst-avatar-* tokens in app/globals.css", () => {
  it("declares exactly the five the palette reads", () => {
    expect(Object.keys(avatarTokens()).sort()).toEqual(["amber", "gold", "nexus", "primary", "shadow"])
  })

  it("keeps every one of them warm — the stage carries ONE red accent", () => {
    // The whole reason this redesign exists. A cool token here would put a
    // second brand colour on the stage, and nothing else would catch it.
    for (const [name, [r, g, b]] of Object.entries(avatarTokens())) {
      expect(r, `--asst-avatar-${name} is not red-dominant`).toBeGreaterThanOrEqual(g)
      expect(r, `--asst-avatar-${name} is not red-dominant`).toBeGreaterThanOrEqual(b)
    }
  })

  it("keeps the TypeScript fallback in step with the tokens", () => {
    // The fallback is a hand-converted mirror used off-DOM (SSR, these tests).
    // Nothing else would notice the two drifting apart.
    const tokens = avatarTokens()
    for (const [name, rgb] of Object.entries(tokens)) {
      const fb = (FALLBACK_PALETTE as unknown as Record<string, [number, number, number]>)[name]
      expect(fb, `FALLBACK_PALETTE has no "${name}"`).toBeDefined()
      for (let i = 0; i < 3; i++) {
        expect(fb[i], `FALLBACK_PALETTE.${name}[${i}] drifted from the token`).toBeCloseTo(rgb[i], 2)
      }
    }
  })
})

describe("resolveHumanoidPalette", () => {
  it("falls back off-DOM (SSR / tests) to the ember palette", () => {
    expect(resolveHumanoidPalette(null)).toBe(FALLBACK_PALETTE)
  })
})

describe("buildHumanoidModel", () => {
  it("builds a dense point cloud with every kind present", () => {
    const pts = buildHumanoidModel()
    expect(pts.length).toBeGreaterThan(12_000)
    const kinds = new Set(pts.map((p) => p.kind))
    for (const k of ["shell", "face", "pathway", "nexus", "wave", "dust"]) {
      expect(kinds.has(k as never)).toBe(true)
    }
  })

  it("puts the skin on a sphere of radius CORE_R centred on the origin", () => {
    const shell = buildHumanoidModel().filter((p) => p.kind === "shell")
    // The outer skin only. Measured from the real model, the interior fill
    // spans 0.186R–0.900R and the skin sits at 0.985–1.015R, so a cut at
    // 0.93R separates them with ~2.9 units of headroom. Widen the interior's
    // range and interior points start averaging into the assertion below.
    const skin = shell
      .map((p) => Math.hypot(p.bx, p.by, p.bz))
      .filter((r) => r > CORE_R * 0.93)
    expect(skin.length).toBeGreaterThan(5_000)
    const mean = skin.reduce((a, b) => a + b, 0) / skin.length
    expect(Math.abs(mean - CORE_R)).toBeLessThan(4)

    // Symmetric about the origin on every axis — the thing a sphere must be
    // and the bust never was. A free-rotating camera makes any offset show up
    // as a wobble, so this is the guard for that.
    for (const axis of ["bx", "by", "bz"] as const) {
      const centre = shell.reduce((a, p) => a + p[axis], 0) / shell.length
      expect(Math.abs(centre)).toBeLessThan(CORE_R * 0.06)
    }
  })

  it("keeps the hot centre well inside the skin", () => {
    // 0.4R, not a tight bound on the current cluster radius: the core's size
    // is a tuning knob (it was widened from 15 to 30 units to read as a bloom
    // rather than a hard speck). What must not change is that the only
    // near-white thing on the stage stays deep inside the sphere instead of
    // reaching the surface and washing the rim out.
    const core = buildHumanoidModel().filter((p) => p.kind === "face")
    for (const p of core) {
      expect(Math.hypot(p.bx, p.by, p.bz)).toBeLessThan(CORE_R * 0.4)
    }
  })

  it("hangs the energy veil outside the skin", () => {
    const veil = buildHumanoidModel().filter((p) => p.kind === "wave")
    for (const p of veil) {
      expect(Math.hypot(p.bx, p.by, p.bz)).toBeGreaterThan(CORE_R)
    }
  })

  it("paints every structural point in ember, never a cool tone", () => {
    // The whole point of the redesign: the stage carries one red accent, so
    // no structural particle may come out blue- or green-dominant.
    for (const p of buildHumanoidModel()) {
      if (p.kind === "dust") continue // ambient motes may be gold or bone-white
      expect(p.r).toBeGreaterThanOrEqual(p.b)
      expect(p.r).toBeGreaterThanOrEqual(p.g)
    }
  })

  it("marks some dust as risers and some as ambient", () => {
    const dust = buildHumanoidModel().filter((p) => p.kind === "dust")
    expect(dust.some((p) => p.rise)).toBe(true)
    expect(dust.some((p) => !p.rise)).toBe(true)
  })

  it("threads a custom palette through instead of hardcoding colour", () => {
    const pal: HumanoidPalette = {
      primary: [0.1, 0.9, 0.2], // deliberately green
      shadow: [0.1, 0.2, 0.9],
      amber: [1, 0.5, 0],
      gold: [1, 0.8, 0.3],
      nexus: [0.9, 0.95, 1],
    }
    const pts = buildHumanoidModel(pal)
    // a green primary yields a green-dominant point on the skin somewhere
    const green = pts.some((p) => p.kind === "shell" && p.g > p.r && p.g > p.b)
    expect(green).toBe(true)
  })
})
