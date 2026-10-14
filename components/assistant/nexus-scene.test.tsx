import { describe, expect, it, vi } from "vitest"
import React from "react"
globalThis.React = React
import { renderToStaticMarkup } from "react-dom/server"
import { buildNexusGeometry, createNexusRenderer, type NexusSettings } from "./nexus-scene"
import { NexusOrb } from "./nexus-orb"

const INITIAL: NexusSettings = { state: "idle", palette: "photon", paused: false, highContrast: false, center: 0 }

/** A canvas with no WebGL. kind "2d" answers getContext("2d") with a context that accepts every call. */
function fakeCanvas(kind: "none" | "2d") {
  const ctx = new Proxy({}, {
    get: (_t, key) => (key === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}),
    set: () => true,
  })
  return {
    width: 0, height: 0, parentElement: null, className: "nx-scene",
    ownerDocument: { hidden: false, addEventListener() {}, removeEventListener() {} },
    getContext: (type: string) => (type === "2d" && kind === "2d" ? ctx : null),
    getBoundingClientRect: () => ({ width: 400, height: 300 }),
    addEventListener() {}, removeEventListener() {},
  } as unknown as HTMLCanvasElement
}

describe("buildNexusGeometry", () => {
  it("builds the reference scene: shells, crystal, core, 29 ring segments, 3 bands, dust", () => {
    const g = buildNexusGeometry()
    expect(g.shellVertices).toHaveLength(162)
    expect(g.coreCount).toBe(1800)
    expect(g.lineRanges).toHaveLength(63)
    expect(g.solidRanges).toHaveLength(31)
    expect(g.total).toBe(9945)
    expect(g.params).toHaveLength(9945 * 4)
    expect(g.glows).toHaveLength(493 * 4)
  })
  it("is the same every time (seeded, so the orb never reshuffles on remount)", () => {
    expect(buildNexusGeometry().params).toEqual(buildNexusGeometry().params)
  })
})

describe("createNexusRenderer", () => {
  it("returns null and never starts a loop when neither WebGL nor 2D is available", () => {
    const raf = vi.fn(() => 1)
    expect(createNexusRenderer(fakeCanvas("none"), { initial: INITIAL, levelRef: { current: 0 }, raf, caf: vi.fn() })).toBeNull()
    expect(raf).not.toHaveBeenCalled()
  })
  it("falls back to 2D and keeps animating while not paused", () => {
    const frames: FrameRequestCallback[] = []
    const raf = vi.fn((cb: FrameRequestCallback) => frames.push(cb))
    const r = createNexusRenderer(fakeCanvas("2d"), { initial: INITIAL, levelRef: { current: 0.4 }, raf, caf: vi.fn() })
    expect(r?.kind).toBe("canvas")
    expect(raf).toHaveBeenCalledTimes(1)
    frames[0](16)
    expect(raf).toHaveBeenCalledTimes(2)
  })
  it("when paused, draws one still frame and schedules no more", () => {
    const frames: FrameRequestCallback[] = []
    const raf = vi.fn((cb: FrameRequestCallback) => frames.push(cb))
    createNexusRenderer(fakeCanvas("2d"), { initial: { ...INITIAL, paused: true }, levelRef: { current: 0 }, raf, caf: vi.fn() })
    expect(raf).toHaveBeenCalledTimes(1)
    frames[0](16)
    expect(raf).toHaveBeenCalledTimes(1)
  })
  it("a change while paused draws exactly one more frame", () => {
    const frames: FrameRequestCallback[] = []
    const raf = vi.fn((cb: FrameRequestCallback) => frames.push(cb))
    const r = createNexusRenderer(fakeCanvas("2d"), { initial: { ...INITIAL, paused: true }, levelRef: { current: 0 }, raf, caf: vi.fn() })
    frames[0](16)
    r?.set({ state: "speaking" })
    expect(raf).toHaveBeenCalledTimes(2)
    frames[1](32)
    expect(raf).toHaveBeenCalledTimes(2)
  })
  it("destroy cancels the pending frame and ignores later changes", () => {
    const raf = vi.fn(() => 7)
    const caf = vi.fn()
    const r = createNexusRenderer(fakeCanvas("2d"), { initial: INITIAL, levelRef: { current: 0 }, raf, caf })
    r?.destroy()
    expect(caf).toHaveBeenCalledWith(7)
    r?.set({ state: "listening" })
    expect(raf).toHaveBeenCalledTimes(1)
  })
})

describe("NexusOrb", () => {
  it("server-renders one labelled, focusable canvas and starts nothing", () => {
    const html = renderToStaticMarkup(
      <NexusOrb state="idle" palette="photon" paused={false} highContrast={false} center={0} levelRef={{ current: 0 }} label="Jarvis's orb, presence online." />
    )
    expect(html).toBe('<canvas tabindex="0" role="img" aria-label="Jarvis&#x27;s orb, presence online." class="nx-scene"></canvas>')
  })
})
