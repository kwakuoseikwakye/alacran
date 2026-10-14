import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

const css = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf-8")

/** The declarations of the first rule whose selector is exactly `selector`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start))
}

const DARK: Record<string, string> = {
  "--bg": "#1c1c1f",
  "--bg-2": "#202024",
  "--surface": "#232327",
  "--surface-2": "#2a2a2f",
  "--surface-3": "#333339",
  "--border": "#2e2e33",
  "--border-strong": "#3d3d44",
  "--text": "#f4f4f5",
  "--text-2": "#a1a1aa",
  "--text-3": "#71717a",
  "--accent": "#f4f4f5",
  "--accent-2": "#d4d4d8",
  "--accent-ink": "#18181b",
  "--marker": "#ff2e43",
  "--focus": "#ff5a6b",
}

const LIGHT: Record<string, string> = {
  "--bg": "#ffffff",
  "--bg-2": "#f7f7f8",
  "--surface": "#f7f7f8",
  "--surface-2": "#efeff1",
  "--surface-3": "#e6e6e9",
  "--border": "#e4e4e7",
  "--border-strong": "#d4d4d8",
  "--text": "#18181b",
  "--text-2": "#5b5b63",
  "--text-3": "#8a8a93",
  "--accent": "#18181b",
  "--accent-2": "#27272a",
  "--accent-ink": "#ffffff",
  "--marker": "#e11d35",
  "--focus": "#e11d35",
}

describe("design tokens in globals.css", () => {
  it("has two themes: dark as the base, light as the one override", () => {
    expect(css).not.toMatch(/data-theme="(mono|mono-light|midnight|ember)"/)
    for (const [name, value] of Object.entries(DARK)) expect(block(":root")).toContain(`${name}: ${value};`)
    for (const [name, value] of Object.entries(LIGHT)) expect(block(':root[data-theme="light"]')).toContain(`${name}: ${value};`)
  })

  it("keeps the main button neutral and the brand red for markers and focus", () => {
    expect(block(":root")).toContain("--primary: var(--accent);")
    expect(block(":root")).toContain("--brand: #e11d35;")
    expect(block(":root")).toContain("--ring: var(--focus);")
  })

  it("has three radii and the system font for everything but code", () => {
    expect(block(":root")).toContain("--r-control: 8px;")
    expect(block(":root")).toContain("--r-panel: 14px;")
    expect(block(":root")).toContain("--r-pill: 999px;")
    expect(block(":root")).toMatch(/--typeface-body: -apple-system, BlinkMacSystemFont/)
    expect(block(":root")).toMatch(/--typeface-mono: var\(--font-mono-face\)/)
  })

  // With a neutral primary, dark mode's primary is near-white, so selected text
  // painted #fff on var(--primary) was white on white.
  it("never paints selected text white on the primary colour", () => {
    expect(css).not.toMatch(/::selection\s*\{[^}]*background:\s*var\(--primary\)/)
  })

  it("declares sidebar and conductor layout variables", () => {
    expect(css).toContain("--sidebar-w: 232px")
    expect(css).toContain("--conductor-w: 0px")
  })

  it("maps os-* utility tokens in @theme inline", () => {
    expect(css).toContain("--color-os-bg: var(--bg)")
    expect(css).toContain("--color-os-bg2: var(--bg-2)")
    expect(css).toContain("--color-os-surface: var(--surface)")
    expect(css).toContain("--color-os-surface2: var(--surface-2)")
    expect(css).toContain("--color-os-surface3: var(--surface-3)")
    expect(css).toContain("--color-os-border: var(--border)")
    expect(css).toContain("--color-os-border-strong: var(--border-strong)")
    expect(css).toContain("--color-os-text: var(--text)")
    expect(css).toContain("--color-os-muted: var(--text-2)")
    expect(css).toContain("--color-os-dim: var(--text-3)")
    expect(css).toContain("--color-os-accent: var(--accent)")
    expect(css).toContain("--color-os-ok: var(--ok)")
    expect(css).toContain("--color-os-warn: var(--warn)")
    expect(css).toContain("--color-os-err: var(--err)")
  })
})
