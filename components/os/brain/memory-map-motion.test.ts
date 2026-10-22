import { describe, it, expect } from "vitest"
import { DRIFT, drift, phase } from "./memory-map-motion"

describe("memory map motion", () => {
  it("gives each dot its own stable rhythm", () => {
    expect(phase("AGENTS.md")).toBe(phase("AGENTS.md"))
    expect(phase("AGENTS.md")).not.toBe(phase("HANDOFF.md"))
    for (const id of ["a", "hub:decisions", "yaml:product.bottleneck"]) {
      expect(phase(id)).toBeGreaterThanOrEqual(0)
      expect(phase(id)).toBeLessThan(1)
    }
  })

  it("never drifts a dot further than DRIFT, so its links still meet it", () => {
    for (let t = 0; t < 120; t += 0.37) {
      const { dx, dy } = drift("notes/company/roadmap.md", t)
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(DRIFT)
    }
  })
})
