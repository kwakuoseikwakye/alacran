import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/link", () => ({ default: "a" }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/guide/actions", () => ({ addGuideAction: vi.fn(), reopenGuideProposalAction: vi.fn() }))

import { GuideCard } from "./guide-card"
import type { GuideState } from "@/lib/guide/refresh"

const COUNTS = { new: 2, reworded: 1, removed: 1 }
const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
const render = (state: GuideState, extra: { counts?: typeof COUNTS | null; dismissed?: boolean } = {}) =>
  decode(renderToStaticMarkup(React.createElement(GuideCard, { companyId: "acme", state, ...extra })))

describe("GuideCard", () => {
  it("not added: offers the explicit Add button", () => {
    const html = render({ state: "not-added" })
    expect(html).toContain("Add the operating guide")
    expect(html).toContain("<button")
  })

  it("up to date: says so and has no button at all, since there is nothing to review", () => {
    const html = render({ state: "up-to-date" })
    expect(html).toContain("Operating guide is up to date")
    expect(html).not.toContain("<button")
    expect(html).not.toContain('href="/c/acme/tasks"')
  })

  it("every state links to the preview of a guide update, so the card can be seen before one exists", () => {
    for (const state of [{ state: "not-added" }, { state: "up-to-date" }, { state: "stale" }, { state: "needs-attention", reason: "edited", detail: "Edited by hand." }] as GuideState[]) {
      const html = render(state)
      expect(html).toMatch(/<a [^>]*href="\/c\/acme\/preview\/guide-update"[^>]*>See what a guide update looks like<\/a>/)
      expect(html).toContain('title="Opens a sample guide update with made-up changes. Nothing is saved."')
    }
  })

  it("out of date: a link into Approvals that names the count, and never a Refresh button", () => {
    const html = render({ state: "stale" }, { counts: COUNTS })
    expect(html).toContain("Operating guide is out of date")
    expect(html).toContain("Something changed outside the app. See what would change before your AIs read it.")
    expect(html).toMatch(/<a [^>]*href="\/c\/acme\/tasks"[^>]*>Review 4 changes<\/a>/)
    expect(html).toContain('title="Opens the change list in Approvals. Nothing is written until you approve it."')
    // globals.css keys the primary button's press effect on this attribute; a link made to look like a button must carry it.
    expect(html).toMatch(/<a [^>]*data-variant="default"[^>]*>Review 4 changes<\/a>/)
    expect(html).not.toContain("<button")
    expect(html).not.toContain("Refresh the guide")
  })

  it("out of date with no counts known still offers a plain Review changes link", () => {
    expect(render({ state: "stale" })).toContain(">Review changes</a>")
  })

  it("after Not now: says nothing is written, and offers Review changes again", () => {
    const html = render({ state: "stale" }, { counts: COUNTS, dismissed: true })
    expect(html).toContain("You chose Not now for these changes. Nothing is written until you review them.")
    expect(html).toContain("Review changes again")
    expect(html).toContain("<button")
    expect(html).not.toContain('href="/c/acme/tasks"')
  })

  it("needs attention: shows the reason and no button", () => {
    const html = render({ state: "needs-attention", reason: "edited", detail: "The operating guide in AGENTS.md was edited by hand." })
    expect(html).toContain("Operating guide needs your attention")
    expect(html).toContain("edited by hand")
    expect(html).not.toContain("<button")
    expect(html).not.toContain('href="/c/acme/tasks"')
  })
})
