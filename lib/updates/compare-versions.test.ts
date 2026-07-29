import { describe, it, expect } from "vitest"
import { compareVersions, parseVersion } from "./compare-versions"

describe("parseVersion", () => {
  it("accepts a plain semver string", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3])
  })

  it("accepts a leading v, which is how git tags are written", () => {
    expect(parseVersion("v0.4.1")).toEqual([0, 4, 1])
  })

  it("ignores a pre-release suffix", () => {
    expect(parseVersion("v2.0.0-beta.3")).toEqual([2, 0, 0])
  })

  it("degrades to 0.0.0 rather than throwing on junk", () => {
    // A malformed upstream tag must never be able to crash the app.
    expect(parseVersion("not-a-version")).toEqual([0, 0, 0])
    expect(parseVersion("")).toEqual([0, 0, 0])
  })
})

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0)
    expect(compareVersions("1.3.0", "1.2.9")).toBeGreaterThan(0)
    expect(compareVersions("1.2.4", "1.2.3")).toBeGreaterThan(0)
  })

  it("reports equality regardless of a v prefix", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0)
  })

  it("reports older correctly", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0)
  })

  it("does not treat 0.10.0 as older than 0.9.0", () => {
    // The classic string-compare bug: "0.10.0" < "0.9.0" lexicographically.
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0)
  })
})
