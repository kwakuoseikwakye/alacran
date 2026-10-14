import { describe, expect, it } from "vitest"
import { shouldFit } from "./fit"

describe("shouldFit", () => {
  it("refuses a hidden (zero-size) host — fitting it would resize the pty to 2x2", () => {
    expect(shouldFit(0, 0)).toBe(false)
    expect(shouldFit(800, 0)).toBe(false)
  })
  it("fits a visible host", () => {
    expect(shouldFit(800, 400)).toBe(true)
  })
})
