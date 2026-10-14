import { describe, it, expect } from "vitest"
import { getVenture, ventureAgentSet, venturesForAgent, VENTURES } from "./ventures"

describe("Org Ventures Lens", () => {
  it("resolves canonical ventures correctly", () => {
    expect(VENTURES.length).toBe(2)
    const vantage = getVenture("vantage")
    expect(vantage).toBeDefined()
    expect(vantage?.id).toBe("vantage")
    expect(vantage?.color).toBe("#00ffaa")

    const launchpad = getVenture("launchpad-cohort")
    expect(launchpad).toBeDefined()
    expect(launchpad?.id).toBe("launchpad-cohort")
  })

  it("ventureAgentSet returns flat set of working agents", () => {
    const agents = ventureAgentSet("vantage")
    expect(agents.size).toBeGreaterThan(0)
    expect(agents.has("vantage-sales")).toBe(true)
    expect(agents.has("conductor")).toBe(true)
  })

  it("venturesForAgent returns ventures that an agent serves", () => {
    const ventures = venturesForAgent("conductor")
    expect(ventures.length).toBe(2)
  })
})
