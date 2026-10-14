import { describe, it, expect } from "vitest"
import { upcomingQuarters } from "./add-milestone-modal"

describe("upcomingQuarters", () => {
  it("starts at this quarter and rolls over into next year", () => {
    expect(upcomingQuarters(new Date(2026, 10, 3), 4)).toEqual(["2026-Q4", "2027-Q1", "2027-Q2", "2027-Q3"])
  })
})
