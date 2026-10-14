import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/link", () => ({ default: "a" }))

import { BrainViewSwitch } from "./brain-view-switch"

const render = (active: "list" | "map") => renderToStaticMarkup(React.createElement(BrainViewSwitch, { companyId: "acme", active }))

describe("BrainViewSwitch", () => {
  it("links to the list and the map, and marks the one you are on", () => {
    const html = render("list")
    expect(html).toContain('href="/c/acme/brain"')
    expect(html).toContain('href="/c/acme/brain?view=map"')
    expect(html).toMatch(/href="\/c\/acme\/brain"[^>]*aria-current="page"/)
    expect(html).not.toMatch(/href="\/c\/acme\/brain\?view=map"[^>]*aria-current/)
  })

  it("marks the map when the map is showing", () => {
    expect(render("map")).toMatch(/href="\/c\/acme\/brain\?view=map"[^>]*aria-current="page"/)
  })
})
