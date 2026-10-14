import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/link", () => ({ default: "a" }))

import { FirstRunHeroView, heroBeat, heroCopy, type FirstRunHeroViewProps, type HeroStage } from "./first-run-hero-view"

const props: FirstRunHeroViewProps = {
  stage: "describe",
  companyName: "Acme",
  running: false,
  tasksHref: "/c/acme/tasks",
  busy: false,
  message: null,
  describeAction: React.createElement("button", null, "WIZARD-TRIGGER"),
  onStart: () => {},
  onDismiss: () => {},
}
const render = (over: Partial<FirstRunHeroViewProps>) =>
  renderToStaticMarkup(React.createElement(FirstRunHeroView, { ...props, ...over }))

describe("FirstRunHeroView", () => {
  it("describe: asks about the business and shows the wizard's own button, nothing else to press", () => {
    const html = render({ stage: "describe" })
    expect(html).toContain("Start here")
    expect(html).toContain("Tell Alacrán about your business")
    expect(html).toContain("WIZARD-TRIGGER")
    expect(html).not.toContain("Prepare my first draft")
  })

  it("describe: says what the wizard really asks (four questions and a check) and promises no time it never measured", () => {
    const html = render({ stage: "describe" })
    expect(html).toContain("Four short questions and a quick check")
    expect(html).not.toContain("Five")
    expect(html).not.toMatch(/minutes?/i)
  })

  it("first-draft: names the company and offers one button; busy says it is starting and disables it", () => {
    const html = render({ stage: "first-draft" })
    expect(html).toContain("See what Alacrán can do for Acme")
    expect(html).toContain("Prepare my first draft")
    const busy = render({ stage: "first-draft", busy: true })
    expect(busy).toContain("Starting…")
    expect(busy).toMatch(/<button[^>]*class="home-first-cta"[^>]*disabled=""/)
  })

  it("review while a run is in flight: says it is working and links to Approvals", () => {
    const html = render({ stage: "review", running: true })
    expect(html).toContain("Alacrán is preparing your draft")
    expect(html).toContain(">Open Approvals")
    expect(html).toContain('href="/c/acme/tasks"')
  })

  it("review with a draft waiting: shows that draft's plain title and a Review link", () => {
    const html = render({ stage: "review", running: false, pendingTitle: "Save your company profile" })
    expect(html).toContain("Save your company profile")
    expect(html).toContain(">Review")
    expect(html).not.toContain("Open Approvals")
  })

  it("always offers to hide the guide, and shows a failed start in words", () => {
    for (const stage of ["describe", "review", "first-draft"] as const) {
      expect(render({ stage })).toContain("I know how this works")
    }
    const html = render({ stage: "first-draft", message: "Sign in to Claude Code first." })
    expect(html).toContain('role="status"')
    expect(html).toContain("Sign in to Claude Code first.")
  })
})

describe("heroCopy", () => {
  it("uses no engineering words on any stage", () => {
    const JARGON = /\b(commit|diff|ontology|entities|yaml|schema)\b/i
    const combos = [
      { stage: "describe", running: false },
      { stage: "first-draft", running: false },
      { stage: "review", running: true },
      { stage: "review", running: false, pendingTitle: "Save your company profile" },
    ] as const
    for (const combo of combos) {
      const copy = heroCopy({ companyName: "Acme", ...combo })
      expect(`${copy.eyebrow} ${copy.title} ${copy.detail}`).not.toMatch(JARGON)
    }
  })

  it("prefers the waiting draft over 'working on it' when both are true", () => {
    const copy = heroCopy({ stage: "review", companyName: "Acme", running: true, pendingTitle: "Save your company profile" })
    expect(copy.title).toBe("Save your company profile")
  })
})

describe("the wizard slot (Home refreshes itself every 15 seconds)", () => {
  const stages: HeroStage[] = ["describe", "first-draft", "review"]
  const slot = (stage: HeroStage) => {
    const section = FirstRunHeroView({ ...props, stage }) as React.ReactElement<{ children: unknown[] }>
    const children = section.props.children
    const index = children.findIndex(
      (child) => React.isValidElement(child) && (child.props as { className?: string }).className === "first-run-hero-wizard"
    )
    const hidden = index >= 0 ? (children[index] as React.ReactElement<{ hidden?: boolean }>).props.hidden : undefined
    return { index, hidden }
  }

  it("keeps the wizard in the same slot in every stage, so React does not unmount it when the stage flips under an open dialog", () => {
    const slots = stages.map(slot)
    expect(slots.every((s) => s.index >= 0)).toBe(true)
    expect(new Set(slots.map((s) => s.index)).size).toBe(1)
  })

  it("shows the wizard's button only while describing, and hides it (never removes it) in the other stages", () => {
    expect(stages.map((stage) => slot(stage).hidden)).toEqual([false, true, true])
    expect(render({ stage: "review", running: true })).toMatch(/<div class="first-run-hero-wizard" hidden="">[\s\S]*WIZARD-TRIGGER/)
    expect(render({ stage: "describe" })).toMatch(/<div class="first-run-hero-wizard">[\s\S]*WIZARD-TRIGGER/)
  })
})

describe("a run that finished with nothing to review", () => {
  const said = "The last run finished without leaving a draft"

  it("says so in plain words, keeps the button, and offers what happened behind a fold", () => {
    const html = render({ stage: "first-draft", endedEmpty: true, runLog: "You have hit your session limit" })
    expect(html).toContain(said)
    expect(html).toMatch(/<span role="status">The last run finished/)
    expect(html).toContain("Prepare my first draft")
    expect(html).toContain("<details")
    expect(html).toContain("Show what happened")
    expect(html).toContain("You have hit your session limit")
  })

  it("says nothing about a run when there was none, while a new one is starting, or in any other stage", () => {
    expect(render({ stage: "first-draft" })).not.toContain(said)
    expect(render({ stage: "first-draft", endedEmpty: true, busy: true })).not.toContain(said)
    expect(render({ stage: "review", running: true, endedEmpty: true })).not.toContain(said)
    expect(render({ stage: "describe", endedEmpty: true })).not.toContain(said)
  })

  it("leaves out the fold when the run left no output", () => {
    expect(render({ stage: "first-draft", endedEmpty: true, runLog: "" })).not.toContain("<details")
  })
})

describe("the loop strip on the hero", () => {
  it("shows where the person is: asking, drafting, or approving", () => {
    expect(heroBeat({ stage: "describe", running: false })).toBe("ask")
    expect(heroBeat({ stage: "first-draft", running: false })).toBe("ask")
    expect(heroBeat({ stage: "review", running: true })).toBe("draft")
    expect(heroBeat({ stage: "review", running: false, pendingTitle: "Save your company profile" })).toBe("approve")
    expect(heroBeat({ stage: "review", running: true, pendingTitle: "Save your company profile" })).toBe("approve")
  })

  it("renders the strip with that beat current", () => {
    const html = render({ stage: "review", running: true })
    expect(html).toContain('aria-label="How Alacrán works"')
    expect(html).toMatch(/<li aria-current="step">Alacrán drafts<\/li>/)
  })
})
