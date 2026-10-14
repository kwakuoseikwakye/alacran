import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { PageHeader } from "./page-header"

describe("PageHeader", () => {
  // Fourteen pages opened on a tracked-caps mono eyebrow, an uppercase title
  // and a blinking terminal cursor — the look that told a business owner the
  // app was for programmers.
  it("titles a page in plain sentence case, with no cursor and no label above it", () => {
    const html = renderToStaticMarkup(React.createElement(PageHeader, { title: "Roadmap" }))
    expect(html).toMatch(/<h1[^>]*>Roadmap<\/h1>/)
    expect(html).not.toContain("uppercase")
    expect(html).not.toContain("tracking-")
    expect(html).not.toContain("animate-pulse")
    expect(html).not.toContain("font-mono")
  })

  it("still carries a subtext and a right-hand slot", () => {
    const html = renderToStaticMarkup(
      React.createElement(PageHeader, { title: "Skills", subtext: "What this company can run", right: React.createElement("button", null, "Add") })
    )
    expect(html).toContain("What this company can run")
    expect(html).toContain(">Add</button>")
  })
})
