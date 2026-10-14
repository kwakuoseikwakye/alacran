import { describe, it, expect } from "vitest"
import { rowSummary } from "./company-credential-row"

describe("rowSummary", () => {
  it("names the machine default so an inherited key is never silent", () => {
    expect(rowSummary("machine")).toBe("Using your machine default")
  })

  it("says so when the company has its own", () => {
    expect(rowSummary("company")).toBe("This company has its own")
  })

  it("points at Connections when nothing is set anywhere", () => {
    expect(rowSummary("unset")).toContain("Connections")
  })
})
