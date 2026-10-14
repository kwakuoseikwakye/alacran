import { describe, expect, it } from "vitest"
import React from "react"
globalThis.React = React
import { renderToStaticMarkup } from "react-dom/server"
import { AgentLiveRegion } from "./agent-parts"

describe("AgentLiveRegion", () => {
  it("is a polite, atomic, screen-reader-only region", () => {
    const html = renderToStaticMarkup(<AgentLiveRegion text="27 this week." />)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="true"')
    expect(html).toContain("sr-only")
    expect(html).toContain("27 this week.")
  })
  it("renders the text for every version and is present when empty", () => {
    expect(renderToStaticMarkup(<AgentLiveRegion text="Same." version={1} />)).toContain("<span>Same.</span>")
    expect(renderToStaticMarkup(<AgentLiveRegion text="Same." version={2} />)).toContain("<span>Same.</span>")
    expect(renderToStaticMarkup(<AgentLiveRegion text="" />)).toContain('aria-live="polite"')
  })
})
