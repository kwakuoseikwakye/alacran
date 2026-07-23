import { describe, it, expect } from "vitest"
import { tailLines } from "./log-tail"

describe("tailLines", () => {
  it("returns all content when shorter than maxLines", () => {
    expect(tailLines("a\nb\nc", 10)).toBe("a\nb\nc")
  })

  it("returns only the last maxLines lines", () => {
    const content = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n")
    const result = tailLines(content, 3)
    expect(result).toBe("line7\nline8\nline9")
  })

  it("returns empty string for empty content", () => {
    expect(tailLines("", 5)).toBe("")
  })

  it("handles a single line with no newline", () => {
    expect(tailLines("only one line", 5)).toBe("only one line")
  })

  it("handles maxLines of exactly the content length", () => {
    expect(tailLines("a\nb\nc", 3)).toBe("a\nb\nc")
  })
})
