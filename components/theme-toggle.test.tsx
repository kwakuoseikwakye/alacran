import { describe, it, expect, vi, afterEach } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { ThemeToggle, applyThemeChoice } from "./theme-toggle"

describe("ThemeToggle", () => {
  it("offers System, Light and Dark as one control, with System chosen until storage says otherwise", () => {
    const html = renderToStaticMarkup(React.createElement(ThemeToggle))
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).toMatch(/aria-pressed="true"[^>]*>System</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Light</)
    expect(html).toMatch(/aria-pressed="false"[^>]*>Dark</)
  })
})

describe("applyThemeChoice", () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubPage(prefersLight: boolean) {
    const stored: Record<string, string> = {}
    const attrs: Record<string, string> = {}
    const appearance: string[] = []
    vi.stubGlobal("localStorage", { setItem: (k: string, v: string) => { stored[k] = v } })
    vi.stubGlobal("document", { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v } } })
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: prefersLight }),
      alacran: { appearance: { set: (choice: string) => appearance.push(choice) } },
    })
    return { stored, attrs, appearance }
  }

  it("stores the choice, re-stamps the page and tells the desktop shell", () => {
    const page = stubPage(true)
    applyThemeChoice("dark")
    expect(page.stored["alacran-theme"]).toBe("dark")
    expect(page.attrs["data-theme"]).toBe("dark")
    expect(page.appearance).toEqual(["dark"])
  })

  it("stamps System as whatever the OS is using", () => {
    const page = stubPage(true)
    applyThemeChoice("system")
    expect(page.attrs["data-theme"]).toBe("light")
    expect(page.appearance).toEqual(["system"])
  })
})
