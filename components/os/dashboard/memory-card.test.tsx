import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { MemoryCard } from "./memory-card"
import type { MemoryItem } from "@/lib/os/memory-items"
import type { MemoryHealth } from "@/lib/os/memory-health/types"

const NOW = new Date("2026-09-30T12:00:00Z")
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)
const render = (items: MemoryItem[]) => renderToStaticMarkup(React.createElement(MemoryCard, { companyId: "acme", items, now: NOW }))
const item = (over: Partial<MemoryItem>): MemoryItem => ({ path: "notes/a.md", kind: "note", title: "A", statement: "", changedAt: at("2026-09-30T11:00:00Z"), ...over })

describe("MemoryCard", () => {
  it("says what is new this week, as statements, in plain words", () => {
    const html = render([
      item({ path: "d", kind: "decision", title: "Price by size", statement: "We price custom cakes by size.", changedAt: at("2026-09-30T11:00:00Z") }),
      item({ path: "n", kind: "note", title: "Supplier call", statement: "", changedAt: at("2026-09-28T12:00:00Z") }),
      item({ path: "old", kind: "note", title: "Old call", changedAt: at("2026-08-01T12:00:00Z") }),
    ])
    expect(html).toContain("What Alacrán knows")
    expect(html).toContain("This week: 1 decision, 1 note")
    expect(html).toContain("We price custom cakes by size.")
    expect(html).toContain("1 hour ago")
    expect(html).toContain("Supplier call")
    expect(html).toContain("2 days ago")
    expect(html).not.toContain("Old call")
    expect(html).not.toMatch(/\b(commit|diff|ontology|yaml|sha)\b/i)
  })

  it("says so in a quiet week, and never shows older items as new", () => {
    const html = render([item({ path: "old", title: "Old call", changedAt: at("2026-08-01T12:00:00Z") })])
    expect(html).toContain("Nothing new this week. Alacrán remembers 1 thing.")
    expect(html).not.toContain("Old call")
  })

  it("says nothing is saved yet when there is nothing", () => {
    expect(render([])).toContain("Nothing saved yet")
  })

  it("adds one memory-health line only when something needs a look", () => {
    const items = [item({ path: "n", title: "Call", changedAt: at("2026-09-30T11:00:00Z") })]
    const ok = (over: Partial<Extract<MemoryHealth, { state: "ok" }>>): MemoryHealth => ({
      state: "ok", score: 100, checkedAt: "2026-09-30T12:00:00.000Z", stale: [], unfinished: [], sources: { state: "tracked", sourced: 1, unsourced: 0 }, ...over,
    })
    const draw = (health?: MemoryHealth) => renderToStaticMarkup(React.createElement(MemoryCard, { companyId: "acme", items, now: NOW, health }))
    expect(draw()).not.toContain("Memory health")
    expect(draw({ state: "none" })).not.toContain("Memory health")
    expect(draw({ state: "unknown" })).not.toContain("Memory health")
    expect(draw(ok({}))).not.toContain("Memory health")
    const html = draw(ok({ score: 80, stale: [{ key: "a", label: "A", ageDays: 100, newerNotes: 3, newerDecisions: 0 }], unfinished: [{ where: "B", line: 1 }] }))
    expect(html).toContain("Memory health 80 · 2 things to look at")
    expect(html).toContain('href="/c/acme/brain"')
  })

  it("links to the brain", () => {
    expect(render([])).toContain('href="/c/acme/brain"')
  })
})
