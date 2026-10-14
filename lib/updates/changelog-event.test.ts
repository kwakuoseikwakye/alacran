import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { ALACRAN_OPEN_CHANGELOG_EVENT, openChangelogModal, type OpenChangelogDetail } from "./changelog-event"

describe("changelog-event", () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window

  beforeEach(() => {
    const target = new EventTarget()
    ;(globalThis as unknown as { window?: unknown }).window = target
  })

  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = originalWindow
  })

  it("dispatches ALACRAN_OPEN_CHANGELOG_EVENT on window with detail", () => {
    let capturedEvent: CustomEvent<OpenChangelogDetail> | null = null
    const listener = (e: Event) => {
      capturedEvent = e as CustomEvent<OpenChangelogDetail>
    }

    window.addEventListener(ALACRAN_OPEN_CHANGELOG_EVENT, listener)
    try {
      openChangelogModal({ initialTab: "feature", highlightVersion: "v157" })
      expect(capturedEvent).toBeTruthy()
      expect(capturedEvent!.detail.initialTab).toBe("feature")
      expect(capturedEvent!.detail.highlightVersion).toBe("v157")
    } finally {
      window.removeEventListener(ALACRAN_OPEN_CHANGELOG_EVENT, listener)
    }
  })

  it("handles empty detail without throwing", () => {
    expect(() => openChangelogModal()).not.toThrow()
  })

  it("gracefully does nothing when window is undefined", () => {
    delete (globalThis as unknown as { window?: unknown }).window
    expect(() => openChangelogModal()).not.toThrow()
  })
})
