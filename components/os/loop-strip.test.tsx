import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { LoopStrip } from "./loop-strip"

// Static markup escapes the apostrophe, so compare on decoded text.
const items = (html: string) => [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/&#x27;/g, "'"))

describe("LoopStrip", () => {
  it("is a labelled ordered list of the four beats", () => {
    const html = renderToStaticMarkup(React.createElement(LoopStrip, {}))
    expect(html).toMatch(/^<ol[^>]*aria-label="How Alacrán works"/)
    expect(items(html)).toEqual(["You ask", "Alacrán drafts", "You approve", "Alacrán remembers it"])
  })

  it("marks exactly the current beat with aria-current, not by colour alone", () => {
    const html = renderToStaticMarkup(React.createElement(LoopStrip, { current: "approve" }))
    expect(html.match(/aria-current="step"/g)?.length).toBe(1)
    expect(html).toMatch(/<li aria-current="step">You approve<\/li>/)
  })

  it("marks nothing when no beat is current", () => {
    expect(renderToStaticMarkup(React.createElement(LoopStrip, {}))).not.toContain("aria-current")
  })
})
