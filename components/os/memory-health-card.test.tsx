import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("@/lib/company-commands/run-company-command", () => ({ runCompanyCommand: vi.fn() }))

import { MemoryHealthCard } from "./memory-health-card"
import { fixResultText } from "./memory-health-fix"
import type { MemoryHealth } from "@/lib/os/memory-health/types"

const html = (health: MemoryHealth) => renderToStaticMarkup(React.createElement(MemoryHealthCard, { companyId: "acme", health }))
const ok = (over: Partial<Extract<MemoryHealth, { state: "ok" }>> = {}): MemoryHealth => ({
  state: "ok",
  score: 100,
  checkedAt: "2026-10-12T12:00:00.000Z",
  stale: [],
  unfinished: [],
  sources: { state: "tracked", sourced: 1, unsourced: 0 },
  ...over,
})

describe("MemoryHealthCard", () => {
  it("renders nothing without a company profile", () => {
    expect(html({ state: "none" })).toBe("")
  })
  it("says it could not check, and shows no score", () => {
    const out = html({ state: "unknown" })
    expect(out).toContain("Couldn&#x27;t check memory health.")
    expect(out).not.toMatch(/\d+ \/ 100/)
  })
  it("is a one-line strip when clean", () => {
    const out = html(ok())
    expect(out).toContain("Memory health 100 · Nothing out of date that Alacrán can see.")
    expect(out).not.toContain("<h3")
  })
  it("shows the sources sentence in the strip when sources are not tracked", () => {
    expect(html(ok({ sources: { state: "not-tracked" } }))).toContain("Sources aren&#x27;t tracked yet.")
  })
  it("shows score, pill, bar, groups, written-label fixes and a company-profile link", () => {
    const out = html(
      ok({
        score: 80,
        stale: [{ key: "pricing", label: "Pricing", ageDays: 142, newerNotes: 5, newerDecisions: 2 }],
        unfinished: [{ where: "Value flow", line: 3 }],
        sources: { state: "not-tracked" },
      })
    )
    expect(out).toContain("80")
    expect(out).toContain("/ 100")
    expect(out).toContain("2 things to look at")
    expect(out).toContain('aria-label="Memory health 80 out of 100"')
    for (const heading of ["Might be out of date", "Not finished", "Sources"]) expect(out).toContain(heading)
    expect(out).toContain("Last changed 142 days ago. 5 notes and 2 decisions saved since.")
    expect(out).toContain("Check it with refresh")
    expect(out).toContain('href="/c/acme/agents"')
    expect(out).toContain("Finish company setup")
    expect(out).toContain("Opens your company profile, where you can fill in what&#x27;s missing.")
    expect(out).not.toMatch(/\.(yaml|md)\b/)
  })
})

describe("fixResultText", () => {
  it("says it started, or passes on the plain refusal", () => {
    expect(fixResultText({ started: true, message: "x" })).toBe("Started. It will show up in Approvals when it is ready.")
    expect(fixResultText({ started: false, message: "That command isn't available for this AI." })).toBe("That command isn't available for this AI.")
  })
})
