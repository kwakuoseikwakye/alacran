import { describe, it, expect } from "vitest"
import {
  radialRestLayout,
  branchPath,
  responsiveRingR,
} from "./tree-layout"

describe("tree-layout math", () => {
  it("derives responsive ring radii correctly", () => {
    const r = responsiveRingR(880, 600)
    expect(r).toHaveLength(5)
    expect(r[0]).toBe(0)
    expect(r[1]).toBeGreaterThan(0)
    expect(r[4]).toBeGreaterThan(r[3])
  })

  it("computes radialRestLayout deterministically", () => {
    const res = radialRestLayout({
      selfId: "self",
      pillars: [
        {
          teamId: "team:dept-sales",
          taskIds: ["task:1"],
          workerIds: ["emp:1"],
          toolIds: ["tool:crm"],
        },
        {
          teamId: "team:dept-tech",
          taskIds: ["task:2"],
          workerIds: ["emp:2"],
          toolIds: ["tool:terminal"],
        },
      ],
      cx: 400,
      cy: 300,
      ringR: [0, 90, 150, 200, 250],
    })

    expect(res.positions.has("self")).toBe(true)
    expect(res.positions.get("self")).toEqual({ x: 400, y: 300 })
    expect(res.positions.has("team:dept-sales")).toBe(true)
    expect(res.positions.has("team:dept-tech")).toBe(true)
  })

  it("produces valid curved SVG branchPath", () => {
    const path = branchPath({ x: 100, y: 300 }, { x: 150, y: 100 })
    expect(path).toMatch(/^M 100 300 C [0-9.]+ [0-9.]+, [0-9.]+ [0-9.]+, 150 100$/)
  })
})
