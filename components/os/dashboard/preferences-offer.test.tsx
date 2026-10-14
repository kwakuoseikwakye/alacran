import { describe, expect, it, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("@/lib/company-commands/run-company-command", () => ({ runCompanyCommand: vi.fn() }))

import { PreferencesOffer, offerResultText } from "./preferences-offer"

describe("PreferencesOffer", () => {
  it("says what was noticed and offers one written-label button with a tooltip", () => {
    const html = renderToStaticMarkup(React.createElement(PreferencesOffer, { companyId: "acme", offer: { commands: [{ id: "digest", revisions: 3 }] } }))
    expect(html).toContain("You&#x27;ve asked for changes to")
    expect(html).toContain("Weekly digest")
    expect(html).toContain("Learn from my feedback")
    expect(html).toContain('title="Reads your recent change requests')
    expect(html).not.toMatch(/\.(md|yaml|json)\b/)
  })
})

describe("offerResultText", () => {
  it("says it started, or passes on the plain refusal", () => {
    expect(offerResultText({ started: true, message: "x" })).toBe("Started. The suggestions will show up in Approvals when they are ready.")
    expect(offerResultText({ started: false, message: "That needs an AI tool that can edit only that document." })).toBe("That needs an AI tool that can edit only that document.")
  })
})
