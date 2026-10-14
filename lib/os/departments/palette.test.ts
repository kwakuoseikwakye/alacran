import { describe, it, expect } from "vitest"
import { DEPARTMENT_PALETTE, isPaletteColor } from "./palette"
import { getCompanyDepartments } from "./registry"

const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function lab(h: string) {
  const [r, g, b] = rgb(h).map(lin)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const dE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))
const luminance = (h: string) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// Built-in departments (registry.ts), discovered grey, team looks and HQ (lib/os/office/rooms.ts).
const FIXED = ["#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#10b981", "#f59e0b", "#14b8a6", "#a3a3a3",
  "#4338ca", "#166534", "#c026d3", "#ea580c", "#7cb518", "#b8a400", "#64748b"]

describe("department palette", () => {
  const hexes = DEPARTMENT_PALETTE.map((c) => c.hex)
  it("has six swatches with distinct names", () => {
    expect(hexes).toHaveLength(6)
    expect(new Set(DEPARTMENT_PALETTE.map((c) => c.name)).size).toBe(6)
  })
  it("every swatch is perceptibly different from every fixed colour and from each other (CIE76 ΔE >= 20)", () => {
    for (const a of hexes) {
      for (const f of FIXED) expect(dE(a, f), `${a} vs ${f}`).toBeGreaterThanOrEqual(20)
      for (const b of hexes) if (a < b) expect(dE(a, b), `${a} vs ${b}`).toBeGreaterThanOrEqual(20)
    }
  })
  it("every swatch has >= 3:1 non-text contrast on light, paper and dark backgrounds", () => {
    for (const a of hexes) for (const bg of ["#ffffff", "#ece3d2", "#050807"]) {
      expect(contrast(a, bg), `${a} on ${bg}`).toBeGreaterThanOrEqual(3)
    }
  })
  it("FIXED really is the built-in set", () => {
    for (const d of getCompanyDepartments()) expect(FIXED).toContain(d.color)
  })
  it("isPaletteColor is case-insensitive and rejects anything else", () => {
    expect(isPaletteColor("#DC2626")).toBe(true)
    expect(isPaletteColor("#000000")).toBe(false)
    expect(isPaletteColor(5)).toBe(false)
  })
})
