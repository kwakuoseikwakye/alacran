import { describe, expect, it } from "vitest"
import { createBacklog } from "./backlog"

describe("createBacklog", () => {
  it("returns everything while under the cap", () => {
    const b = createBacklog(10)
    b.push("abc")
    b.push("def")
    expect(b.text()).toBe("abcdef")
  })

  it("keeps exactly the last `max` characters once over it", () => {
    const b = createBacklog(5)
    b.push("abc")
    b.push("def")
    b.push("gh")
    expect(b.text()).toBe("defgh")
  })

  it("stays bounded under a flood of one-character chunks", () => {
    const b = createBacklog(100)
    for (let i = 0; i < 50_000; i++) b.push(String(i % 10))
    const text = b.text()
    expect(text.length).toBe(100)
    expect(text.endsWith("56789")).toBe(true)
  })

  it("ignores empty chunks", () => {
    const b = createBacklog(5)
    b.push("")
    expect(b.text()).toBe("")
  })
})
