import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/link", () => ({ default: "a" }))

import { GuideHomeRow } from "./guide-home-row"

const render = (counts: { new: number; reworded: number; removed: number }) =>
  renderToStaticMarkup(React.createElement(GuideHomeRow, { companyId: "acme", counts }))

describe("GuideHomeRow", () => {
  it("is the Home focus strip with the plain title, sentence, colour tags and a button naming the count", () => {
    const html = render({ new: 2, reworded: 1, removed: 1 })
    expect(html).toContain('class="native-home-focus guide-home-row"')
    expect(html).toContain('aria-label="Guide update"')
    expect(html).toContain("<h2>Your operating guide is out of date</h2>")
    expect(html).toContain("Something changed outside Alacrán. Your AIs will keep working from the old guide until you update it.")
    expect(html).toContain('<span class="guide-chip guide-chip--new">2 new</span>')
    expect(html).toContain('<span class="guide-chip guide-chip--reworded">1 reworded</span>')
    expect(html).toContain('<span class="guide-chip guide-chip--removed">1 removed</span>')
    expect(html).toMatch(/<a [^>]*href="\/c\/acme\/tasks"[^>]*>Review 4 changes /)
  })

  it("the link says in a tooltip where it goes and that nothing is written yet", () => {
    const html = render({ new: 2, reworded: 1, removed: 1 })
    expect(html).toMatch(/<a [^>]*title="Opens the change list in Approvals\. Nothing is written until you approve it\."[^>]*>Review 4 changes /)
  })

  it("leaves a zero tag out and says '1 change' for exactly one", () => {
    const html = render({ new: 0, reworded: 1, removed: 0 })
    expect(html).not.toContain("guide-chip--new")
    expect(html).not.toContain("guide-chip--removed")
    expect(html).toContain("Review 1 change ")
    expect(html).not.toContain("Review 1 changes")
  })

  it("links to Approvals for the right company", () => {
    const html = renderToStaticMarkup(React.createElement(GuideHomeRow, { companyId: "other-co", counts: { new: 1, reworded: 0, removed: 0 } }))
    expect(html).toContain('href="/c/other-co/tasks"')
  })
})
