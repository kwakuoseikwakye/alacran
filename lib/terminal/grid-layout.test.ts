import { describe, expect, it } from "vitest"
import { dragTrack, evenTracks, gridFor, layoutAfterOpen, MIN_TRACK, tracksFor } from "./grid-layout"

const sum = (tracks: number[]) => tracks.reduce((a, b) => a + b, 0)

describe("evenTracks", () => {
  it("splits the grid into equal shares that add up to one", () => {
    expect(evenTracks(2)).toEqual([0.5, 0.5])
    expect(sum(evenTracks(3))).toBeCloseTo(1)
    expect(evenTracks(0)).toEqual([1])
  })
})

describe("dragTrack", () => {
  it("moves the line between two tracks: one grows, its neighbour shrinks by the same amount", () => {
    const next = dragTrack([0.5, 0.5], 0, 0.1)
    expect(next[0]).toBeCloseTo(0.6)
    expect(next[1]).toBeCloseTo(0.4)
  })

  it("leaves every other track alone", () => {
    const next = dragTrack([0.3, 0.4, 0.3], 1, 0.1)
    expect(next[0]).toBeCloseTo(0.3)
    expect(next[1]).toBeCloseTo(0.5)
    expect(next[2]).toBeCloseTo(0.2)
  })

  it("never shrinks a track below the minimum, whichever way it is dragged", () => {
    const right = dragTrack([0.5, 0.5], 0, 0.9)
    expect(right[1]).toBeCloseTo(MIN_TRACK)
    expect(sum(right)).toBeCloseTo(1)
    const left = dragTrack([0.5, 0.5], 0, -0.9)
    expect(left[0]).toBeCloseTo(MIN_TRACK)
    expect(sum(left)).toBeCloseTo(1)
  })

  it("is a no-op for a line that does not exist", () => {
    expect(dragTrack([0.5, 0.5], 1, 0.1)).toEqual([0.5, 0.5])
    expect(dragTrack([1], 0, 0.1)).toEqual([1])
  })
})

describe("tracksFor", () => {
  it("uses saved sizes only when they fit the grid being drawn", () => {
    expect(tracksFor(2, [0.7, 0.3])).toEqual([0.7, 0.3])
  })

  it("falls back to even for anything stale or damaged", () => {
    expect(tracksFor(3, [0.7, 0.3])).toEqual(evenTracks(3))
    expect(tracksFor(2, [0.95, 0.05])).toEqual([0.5, 0.5])
    expect(tracksFor(2, [0.6, 0.6])).toEqual([0.5, 0.5])
    expect(tracksFor(2, [Number.NaN, 0.5])).toEqual([0.5, 0.5])
    expect(tracksFor(2, "oops")).toEqual([0.5, 0.5])
    expect(tracksFor(2, undefined)).toEqual([0.5, 0.5])
  })
})

describe("gridFor", () => {
  it("lays out one to eight panes as the spec draws them", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(gridFor)).toEqual([
      { cols: 1, rows: 1 },
      { cols: 2, rows: 1 },
      { cols: 2, rows: 2 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 4, rows: 2 },
      { cols: 4, rows: 2 },
    ])
  })

  it("adds rows of four past eight (finished runs whose sessions are gone are slots too)", () => {
    expect(gridFor(10)).toEqual({ cols: 4, rows: 3 })
    expect(gridFor(0)).toEqual({ cols: 1, rows: 1 })
  })
})

describe("layoutAfterOpen", () => {
  it("a second terminal in the same workspace opens beside the first, in the grid", () => {
    expect(layoutAfterOpen("focus", 1)).toBe("grid")
    expect(layoutAfterOpen("grid", 3)).toBe("grid")
  })

  it("the first terminal keeps whatever layout was chosen", () => {
    expect(layoutAfterOpen("focus", 0)).toBe("focus")
    expect(layoutAfterOpen("grid", 0)).toBe("grid")
  })
})
