import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/link", () => ({ default: "a" }))

import { BrainViewSwitch } from "./brain-view-switch"

const render = (active: "list" | "map") => renderToStaticMarkup(React.createElement(BrainViewSwitch, { companyId: "acme", active }))

describe("BrainViewSwitch", () => {
  it("lists Map first, then List, and links each to its view", () => {
    const html = render("map")
    expect(html.indexOf(">Map<")).toBeGreaterThan(-1)
    expect(html.indexOf(">Map<")).toBeLessThan(html.indexOf(">List<"))
    expect(html).toContain('href="/c/acme/brain"')
    expect(html).toContain('href="/c/acme/brain?view=list"')
    expect(html).toMatch(/href="\/c\/acme\/brain"[^>]*aria-current="page"/)
    expect(html).not.toMatch(/href="\/c\/acme\/brain\?view=list"[^>]*aria-current/)
  })

  it("marks the list when the list is showing", () => {
    expect(render("list")).toMatch(/href="\/c\/acme\/brain\?view=list"[^>]*aria-current="page"/)
  })
})
