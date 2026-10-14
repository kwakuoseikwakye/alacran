import { describe, it, expect, vi, afterEach } from "vitest"
import { flyToApprovals, prefersReducedMotion, shouldBlend } from "./motion"

// The flight plays after an approval has already been saved. Whatever the
// page looks like, it has to finish quickly and quietly — never throw, never
// hang the list that is waiting to drop the approved card.
describe("flyToApprovals", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("does nothing without a card to fly", async () => {
    await expect(flyToApprovals(null)).resolves.toBeUndefined()
  })

  it("skips the flight when the person asked for reduced motion", async () => {
    const appendChild = vi.fn()
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) })
    vi.stubGlobal("document", { querySelector: () => ({}), body: { appendChild } })
    await expect(flyToApprovals({} as Element)).resolves.toBeUndefined()
    expect(appendChild).not.toHaveBeenCalled()
  })

  it("skips the flight when the sidebar has no count to fly into", async () => {
    const appendChild = vi.fn()
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal("document", { querySelector: () => null, body: { appendChild } })
    await expect(flyToApprovals({} as Element)).resolves.toBeUndefined()
    expect(appendChild).not.toHaveBeenCalled()
  })
})

describe("prefersReducedMotion", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("reads the OS setting, and treats a page with no window as reduced", () => {
    vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q === "(prefers-reduced-motion: reduce)" }) })
    expect(prefersReducedMotion()).toBe(true)
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) })
    expect(prefersReducedMotion()).toBe(false)
    vi.stubGlobal("window", undefined)
    expect(prefersReducedMotion()).toBe(true)
  })
})

describe("shouldBlend", () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

  it("blends a plain click to another page", () => {
    expect(shouldBlend(plain, false)).toBe(true)
  })

  // A blend waits for the URL to change. Clicking the page you are already on
  // never changes it, so the window would sit frozen until the timeout.
  it("never blends a click on the page you are already on", () => {
    expect(shouldBlend(plain, true)).toBe(false)
  })

  it("leaves new-tab and new-window clicks to the browser", () => {
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(shouldBlend({ ...plain, [key]: true }, false)).toBe(false)
    expect(shouldBlend({ ...plain, button: 1 }, false)).toBe(false)
  })
})
