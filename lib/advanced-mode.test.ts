import { describe, it, expect, beforeEach } from "vitest"
import { ADVANCED_MODE_KEY, seedSimpleModeForFreshInstall } from "./advanced-mode"

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  // A stand-in rather than jsdom: this module is plain and the behaviour under
  // test is entirely "what is already in the key".
  ;(globalThis as { window?: unknown }).window = { localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } } as unknown as Window & typeof globalThis
})

describe("seedSimpleModeForFreshInstall", () => {
  it("writes simple mode when nothing has ever been chosen", () => {
    seedSimpleModeForFreshInstall()
    expect(store.get(ADVANCED_MODE_KEY)).toBe("0")
  })

  it("tells the open page, so the first form it renders is already simple", () => {
    // Child effects run before the parent's, so AddCompanyForm and the sidebar
    // read the old value and stay advanced until a remount — the very first
    // "create my first company" form showed the path field and advanced shape.
    let fired = 0
    ;(globalThis as { window?: unknown }).window = {
      localStorage: { getItem: () => null, setItem: () => {} },
      dispatchEvent: () => {
        fired++
        return true
      },
    }
    seedSimpleModeForFreshInstall()
    expect(fired).toBe(1)
  })

  it("stays quiet when there was nothing to change", () => {
    let fired = 0
    ;(globalThis as { window?: unknown }).window = {
      localStorage: { getItem: () => "1", setItem: () => {} },
      dispatchEvent: () => {
        fired++
        return true
      },
    }
    seedSimpleModeForFreshInstall()
    expect(fired).toBe(0)
  })

  it("leaves an explicit advanced choice alone", () => {
    // The whole point of seeding at zero companies: someone who already chose
    // advanced must not be reset by a later visit to a fresh-install screen.
    store.set(ADVANCED_MODE_KEY, "1")
    seedSimpleModeForFreshInstall()
    expect(store.get(ADVANCED_MODE_KEY)).toBe("1")
  })

  it("leaves an explicit simple choice alone", () => {
    store.set(ADVANCED_MODE_KEY, "0")
    seedSimpleModeForFreshInstall()
    expect(store.get(ADVANCED_MODE_KEY)).toBe("0")
  })

  it("does nothing rather than throwing where storage is unavailable", () => {
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("denied")
        },
      },
    }
    expect(() => seedSimpleModeForFreshInstall()).not.toThrow()
  })
})
