import { describe, expect, it } from "vitest"
import { MAX_TASK, sanitizeTaskText } from "./task-text"

describe("sanitizeTaskText", () => {
  it("makes one plain line: newlines, tabs, carriage returns and ESC all become single spaces", () => {
    expect(sanitizeTaskText("draft the plan\n\nthen\tsend it\r\nnow")).toBe("draft the plan then send it now")
  })
  it("removes terminal escape and bracketed-paste sequences' control bytes", () => {
    const out = sanitizeTaskText("\u001b[200~rm -rf /\u001b[201~ hello \u009b31m")
    expect(out).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
    expect(out).toContain("hello")
  })
  it("turns the Unicode line and paragraph separators into spaces", () => {
    // Built with fromCharCode so no raw U+2028 / U+2029 byte sits in this source file.
    expect(sanitizeTaskText("a" + String.fromCharCode(0x2028) + "b" + String.fromCharCode(0x2029) + "c")).toBe("a b c")
  })
  it("treats non-strings and blanks as empty", () => {
    expect(sanitizeTaskText(undefined)).toBe("")
    expect(sanitizeTaskText(42)).toBe("")
    expect(sanitizeTaskText("   \n  ")).toBe("")
  })
  it("caps at MAX_TASK characters", () => {
    expect(sanitizeTaskText("x".repeat(MAX_TASK + 100))).toHaveLength(MAX_TASK)
  })
})
