import { describe, expect, it } from "vitest"
import type { ToolStatus } from "@/lib/connect/connect-status-impl"
import { readinessMap, readinessOf } from "./executor-readiness"

const tool = (over: Partial<ToolStatus>): ToolStatus => ({
  id: "claude-code",
  label: "Claude Code",
  connected: false,
  detail: "",
  guidance: { steps: [] },
  ...over,
})

describe("readinessOf", () => {
  it("says ready only when connected", () => {
    expect(readinessOf(tool({ connected: true }))).toBe("ready")
  })
  it("says needs-sign-in for an installed AI nobody is signed into", () => {
    expect(readinessOf(tool({ needsSignIn: true }))).toBe("needs-sign-in")
  })
  it("says not-installed otherwise", () => {
    expect(readinessOf(tool({}))).toBe("not-installed")
  })
  it("keys the map by executor id", () => {
    expect(readinessMap([tool({ id: "kiro", connected: true })])).toEqual({ kiro: "ready" })
  })
})
