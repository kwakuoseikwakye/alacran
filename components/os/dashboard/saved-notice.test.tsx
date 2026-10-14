import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { SavedNotice } from "./saved-notice"

describe("SavedNotice", () => {
  it("says the first draft is saved and kept, in plain words, as a status", () => {
    const html = renderToStaticMarkup(React.createElement(SavedNotice))
    expect(html).toContain("Your first draft is saved")
    expect(html).toContain("in your company")
    expect(html).not.toContain("from now on")
    expect(html).toContain('role="status"')
    expect(html).not.toMatch(/\b(commit|diff|ontology|entities|yaml)\b/i)
  })
})
