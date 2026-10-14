import { describe, it, expect } from "vitest"
import { computeDiffStats } from "./diff-stats"

describe("computeDiffStats", () => {
  it("detects identical content", () => {
    const text = "alpha: 1\nbeta: 2\n"
    const stats = computeDiffStats(text, text)
    expect(stats.changeType).toBe("identical")
    expect(stats.linesAdded).toBe(0)
    expect(stats.linesRemoved).toBe(0)
  })

  it("detects newly created file", () => {
    const stats = computeDiffStats("", "line 1\nline 2\nline 3\n")
    expect(stats.changeType).toBe("created")
    expect(stats.linesAdded).toBeGreaterThanOrEqual(3)
    expect(stats.linesRemoved).toBe(0)
  })

  it("detects deleted file content", () => {
    const stats = computeDiffStats("line 1\nline 2\n", "")
    expect(stats.changeType).toBe("deleted")
    expect(stats.linesAdded).toBe(0)
    expect(stats.linesRemoved).toBeGreaterThanOrEqual(2)
  })

  it("computes added and removed lines for modifications", () => {
    const oldText = "first\nsecond\nthird\n"
    const newText = "first\nmodified second\nthird\nfourth\n"
    const stats = computeDiffStats(oldText, newText)
    expect(stats.changeType).toBe("modified")
    expect(stats.linesAdded).toBeGreaterThanOrEqual(2)
    expect(stats.linesRemoved).toBeGreaterThanOrEqual(1)
  })
})
