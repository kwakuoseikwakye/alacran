import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { SetupReviewActions } from "./setup-review-actions"

const render = (over: Partial<React.ComponentProps<typeof SetupReviewActions>>) =>
  renderToStaticMarkup(
    React.createElement(SetupReviewActions, {
      aiReady: true,
      pending: false,
      connectHref: "/c/acme/dashboard",
      onDraft: () => {},
      onSave: () => {},
      ...over,
    })
  )

describe("SetupReviewActions", () => {
  it("leads with letting Alacrán write it up when the AI is ready, and keeps the plain save", () => {
    const html = render({})
    expect(html).toContain("Let Alacrán write it up")
    expect(html).toContain("Save my answers as they are")
    expect(html).not.toContain("Let AI tidy this up")
  })

  it("says to connect the AI first, with a link, when it is not ready, and still lets them save", () => {
    const html = render({ aiReady: false })
    expect(html).toContain("Connect your AI first")
    expect(html).toContain('href="/c/acme/dashboard"')
    expect(html).not.toContain("</svg>Let Alacrán write it up")
    expect(html).toContain("Save my answers as they are")
  })

  it("disables both buttons while saving and says so", () => {
    const html = render({ pending: true })
    expect(html.match(/disabled=""/g)?.length).toBe(2)
    expect(html).toContain("Saving…")
  })
})
