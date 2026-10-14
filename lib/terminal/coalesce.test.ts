import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createCoalescer } from "./coalesce"

describe("createCoalescer", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("flushes the first chunk after idle immediately — a keystroke echo must not wait", () => {
    const out: string[] = []
    const c = createCoalescer((d) => out.push(d), 16)
    c.push("a")
    expect(out).toEqual(["a"])
  })

  it("batches chunks that arrive within the interval into one flush", () => {
    const out: string[] = []
    const c = createCoalescer((d) => out.push(d), 16)
    c.push("a")
    c.push("b")
    c.push("c")
    expect(out).toEqual(["a"])
    vi.advanceTimersByTime(16)
    expect(out).toEqual(["a", "bc"])
  })

  it("flushes early once maxChars is reached", () => {
    const out: string[] = []
    const c = createCoalescer((d) => out.push(d), 16, 4)
    c.push("x")
    c.push("1234")
    expect(out).toEqual(["x", "1234"])
  })

  it("close() delivers what is pending and stops the timer", () => {
    const out: string[] = []
    const c = createCoalescer((d) => out.push(d), 16)
    c.push("a")
    c.push("ended")
    c.close()
    expect(out).toEqual(["a", "ended"])
    vi.advanceTimersByTime(100)
    expect(out).toEqual(["a", "ended"])
  })
})
