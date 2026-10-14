import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React
import { DefineCompanyDraftView } from "./define-company-draft-view"

const render = (over: Partial<React.ComponentProps<typeof DefineCompanyDraftView>>) =>
  renderToStaticMarkup(
    React.createElement(DefineCompanyDraftView, {
      phase: "running",
      changed: false,
      noChangeMessage: null,
      message: null,
      tail: "",
      onReview: () => {},
      onBack: () => {},
      ...over,
    })
  )

const JARGON = /\b(commit|diff|ontology|entities|yaml)\b/i

describe("DefineCompanyDraftView", () => {
  it("while drafting: says so, marks the drafting beat, and keeps the raw progress behind a fold", () => {
    const html = render({ phase: "running", tail: "some log line" })
    expect(html).toContain("Alacrán is writing up your business")
    expect(html).toMatch(/<li aria-current="step">Alacrán drafts<\/li>/)
    expect(html).toContain("<details")
    expect(html).toContain("Show progress")
    expect(html).not.toContain("Review it in Approvals")
    expect(html).not.toMatch(JARGON)
  })

  it("promises no duration while drafting (no paid run was ever timed to back one)", () => {
    expect(render({ phase: "running" })).not.toMatch(/minutes?|seconds?|usually/i)
  })

  it("when the draft is ready: sends them to Approvals, says to check it carefully, marks the approving beat", () => {
    const html = render({ phase: "finished", changed: true })
    expect(html).toContain("Your draft is ready")
    expect(html).toContain("check it carefully in Approvals")
    expect(html).toContain("Nothing is saved until you approve it")
    expect(html).toContain("Review it in Approvals")
    expect(html).toMatch(/<li aria-current="step">You approve<\/li>/)
    expect(html).not.toMatch(JARGON)
  })

  it("when nothing came back: says why in words, offers no review button, and lets them go back", () => {
    const html = render({ phase: "finished", changed: false, noChangeMessage: "Alacrán had nothing to add." })
    expect(html).toContain("Alacrán had nothing to add.")
    expect(html).not.toContain("Review it in Approvals")
    expect(html).toContain("Back to my answers")
  })

  it("falls back to a plain sentence when nothing came back and there is no message", () => {
    const html = render({ phase: "finished", changed: false })
    expect(html).toContain("save your answers as they are")
  })

  it("says beforehand why Approvals will call a company-profile draft High risk, so the red chip is not a shock", () => {
    const html = render({ phase: "finished", changed: true })
    expect(html).toContain("High risk")
    expect(html).toContain("in plain sentences")
    expect(html).toContain("builds on your company profile")
    expect(html).toContain("does not mean anything is wrong")
    expect(html).not.toMatch(JARGON)
  })

  it("does not talk about risk while drafting or when there is nothing to review", () => {
    expect(render({ phase: "running", changed: true })).not.toContain("High risk")
    expect(render({ phase: "finished", changed: false })).not.toContain("High risk")
  })

  it("never shows the ready message or the review button while it is still drafting, whatever it is told", () => {
    const html = render({ phase: "running", changed: true })
    expect(html).not.toContain("Your draft is ready")
    expect(html).not.toContain("Review it in Approvals")
    expect(html).toMatch(/<li aria-current="step">Alacrán drafts<\/li>/)
  })

  it("shows a failed start in words", () => {
    const html = render({ phase: "finished", message: "Sign in to Claude Code first." })
    expect(html).toContain('role="status"')
    expect(html).toContain("Sign in to Claude Code first.")
  })
})
