import { beforeEach, describe, expect, it, vi } from "vitest"

const pending = vi.fn()
const load = vi.fn()
vi.mock("./pending", () => ({ hasPendingPreferenceReview: (...a: unknown[]) => pending(...a) }))
vi.mock("./offer", () => ({ loadPreferenceOffer: (...a: unknown[]) => load(...a) }))

import { loadPreferenceOfferFor } from "./offer-load"

describe("loadPreferenceOfferFor", () => {
  beforeEach(() => { pending.mockReset(); load.mockReset() })
  it("is null, without reading the log, while a review is pending", async () => {
    pending.mockResolvedValue(true)
    expect(await loadPreferenceOfferFor("acme", "/root")).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
  it("returns the offer when nothing is pending", async () => {
    pending.mockResolvedValue(false)
    load.mockResolvedValue({ commands: [{ id: "digest", revisions: 3 }] })
    expect(await loadPreferenceOfferFor("acme", "/root")).toEqual({ commands: [{ id: "digest", revisions: 3 }] })
  })
})
