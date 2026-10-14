import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { MemoryList } from "./memory-list"
import type { MemoryItem } from "@/lib/os/memory-items"

const NOW = new Date("2026-09-30T12:00:00Z")
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000)
const render = (items: MemoryItem[]) => renderToStaticMarkup(React.createElement(MemoryList, { items, now: NOW }))
const item = (over: Partial<MemoryItem>): MemoryItem => ({ path: "notes/a.md", kind: "note", title: "A", statement: "", changedAt: at("2026-08-01T12:00:00Z"), ...over })

describe("MemoryList", () => {
  it("groups memory into facts, decisions and notes, newest first as given", () => {
    const html = render([
      item({ path: "d", kind: "decision", title: "Price by size", statement: "We price by size.", changedAt: at("2026-09-29T12:00:00Z") }),
      item({ path: "f", kind: "fact", title: "Your company profile", statement: "Your business: A bakery" }),
      item({ path: "n", kind: "note", title: "Supplier call", statement: "Delivery moves to Tuesdays." }),
    ])
    expect(html.indexOf("Facts")).toBeLessThan(html.indexOf("Decisions"))
    expect(html.indexOf("Decisions")).toBeLessThan(html.indexOf("Notes"))
    expect(html).toContain("We price by size.")
    expect(html).toContain("yesterday")
    expect(html).not.toMatch(/\b(commit|diff|ontology|yaml|sha)\b/i)
  })

  it("marks only this week's items as new", () => {
    const html = render([
      item({ path: "new", title: "Fresh", changedAt: at("2026-09-29T12:00:00Z") }),
      item({ path: "old", title: "Stale", changedAt: at("2026-08-01T12:00:00Z") }),
    ])
    expect(html.match(/New this week/g)).toHaveLength(1)
  })

  it("does not repeat a statement that equals its title", () => {
    const html = render([item({ title: "Same words", statement: "Same words" })])
    expect(html.match(/Same words/g)).toHaveLength(1)
  })

  it("says how an empty section fills, and does not fail with nothing at all", () => {
    const html = render([])
    expect(html).toContain("Decisions you record show up here.")
    expect(html).toContain("Notes from your work sessions show up here.")
    expect(html).toContain("Facts about your business show up here once you describe it.")
  })
})
