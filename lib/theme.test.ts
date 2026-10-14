import { describe, it, expect } from "vitest"
import {
  THEME_CHOICES,
  DEFAULT_THEME_CHOICE,
  THEME_STORAGE_KEY,
  THEME_LABELS,
  THEME_INIT_SCRIPT,
  appliedTheme,
  resolveThemeChoice,
} from "./theme"

/** Runs the pre-paint script against a stub page: what it stamps, what it
 *  tells the desktop shell, and a way to flip the OS appearance afterwards. */
function runInitScript(stored: string | null, prefersLight: boolean) {
  const attrs: Record<string, string> = {}
  const listeners: Array<() => void> = []
  const media = { matches: prefersLight, addEventListener: (_type: string, fn: () => void) => listeners.push(fn) }
  const appearance: string[] = []
  const win = { matchMedia: () => media, alacran: { appearance: { set: (choice: string) => appearance.push(choice) } } }
  const doc = { documentElement: { setAttribute: (name: string, value: string) => { attrs[name] = value } } }
  const storage = { getItem: () => stored }
  new Function("window", "document", "localStorage", THEME_INIT_SCRIPT)(win, doc, storage)
  return {
    theme: () => attrs["data-theme"],
    appearance,
    flipOs(light: boolean) {
      media.matches = light
      listeners.forEach((fn) => fn())
    },
  }
}

describe("lib/theme", () => {
  it("offers System, Light and Dark, and starts on System", () => {
    expect(THEME_CHOICES).toEqual(["system", "light", "dark"])
    expect(DEFAULT_THEME_CHOICE).toBe("system")
    expect(THEME_LABELS).toEqual({ system: "System", light: "Light", dark: "Dark" })
    expect(THEME_STORAGE_KEY).toBe("alacran-theme")
  })

  // Six named skins shipped before 2026-09-28. Someone who picked one keeps the
  // nearer of the two new themes instead of being dropped back to System.
  it("maps every stored skin from an older release to the nearer theme", () => {
    for (const skin of ["mono", "dark", "midnight", "ember"]) expect(resolveThemeChoice(skin)).toBe("dark")
    for (const skin of ["mono-light", "light"]) expect(resolveThemeChoice(skin)).toBe("light")
  })

  it("falls back to System for no choice, an unknown value, or an object key", () => {
    expect(resolveThemeChoice("system")).toBe("system")
    expect(resolveThemeChoice(null)).toBe("system")
    expect(resolveThemeChoice("neon")).toBe("system")
    expect(resolveThemeChoice("__proto__")).toBe("system")
    expect(resolveThemeChoice("toString")).toBe("system")
  })

  it("applies System from the OS and the other two as chosen", () => {
    expect(appliedTheme("system", true)).toBe("light")
    expect(appliedTheme("system", false)).toBe("dark")
    expect(appliedTheme("light", false)).toBe("light")
    expect(appliedTheme("dark", true)).toBe("dark")
  })

  describe("the pre-paint script", () => {
    it("stamps an older release's skin as its new theme", () => {
      expect(runInitScript("midnight", true).theme()).toBe("dark")
    })

    it("follows the OS on System, and keeps following it while the app is open", () => {
      const page = runInitScript("system", true)
      expect(page.theme()).toBe("light")
      page.flipOs(false)
      expect(page.theme()).toBe("dark")
    })

    it("treats no stored choice as System", () => {
      expect(runInitScript(null, false).theme()).toBe("dark")
    })

    it("stops following the OS once a theme is chosen", () => {
      const page = runInitScript("light", false)
      page.flipOs(false)
      expect(page.theme()).toBe("light")
    })

    it("tells the desktop shell which appearance to draw its glass in", () => {
      expect(runInitScript("midnight", false).appearance).toEqual(["dark"])
      expect(runInitScript(null, true).appearance).toEqual(["system"])
    })
  })
})
