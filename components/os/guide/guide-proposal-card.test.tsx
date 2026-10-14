import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/guide/actions", () => ({ approveGuideProposalAction: vi.fn(), dismissGuideProposalAction: vi.fn() }))
vi.mock("@/components/os/motion", () => ({ flyToApprovals: vi.fn(async () => {}) }))

import { GuideProposalCard } from "./guide-proposal-card"
import { parseBlock } from "@/lib/guide/apply"
import { buildProposal } from "@/lib/guide/proposal"
import { renderGuide } from "@/lib/guide/render"
import type { GuideInputs } from "@/lib/guide/render"

const BASE: GuideInputs = {
  departments: [{ slug: "legal", name: "Legal", purpose: "Contracts and compliance." }],
  teams: [{ id: "sales", label: "Sales", summary: "Leads and accounts.", commands: ["follow-up-lead"] }],
  commands: [{ name: "old-brief", description: "Draft the weekly brief." }],
}
const AFTER: GuideInputs = {
  departments: [{ slug: "legal", name: "Legal", purpose: "Contracts, compliance and vendor reviews." }],
  teams: [BASE.teams[0], { id: "marketing", label: "Marketing", summary: "Campaigns, content and positioning.", commands: [] }],
  commands: [{ name: "pricing-strategy", description: "Work out a pricing model and test it against your costs." }],
}
function proposal(before = BASE, after = AFTER) {
  const old = parseBlock(renderGuide(before).block)
  if (old.kind !== "ok") throw new Error("expected a block")
  return buildProposal(old.body, renderGuide(after), "b".repeat(64))
}
const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&")
const render = (p: ReturnType<typeof proposal> | null) =>
  decode(renderToStaticMarkup(React.createElement(GuideProposalCard, { companyId: "acme", proposal: p })))

describe("GuideProposalCard", () => {
  it("renders nothing when there is no proposal and nothing to say", () => {
    expect(render(null)).toBe("")
  })

  it("is the Guide update section with the approval eyebrow, title, risk pill and the summary sentence", () => {
    const html = render(proposal())
    expect(html).toContain("<h2")
    expect(html).toContain("Guide update")
    expect(html).toContain("Ready for your decision")
    expect(html).toContain("Your operating guide is out of date")
    expect(html).toContain("Low risk")
    expect(html).toContain("4 changes since your AIs last read it: 2 new, 1 reworded, 1 removed")
  })

  it("groups the changes under Teams, Commands and Departments with tagged rows and the before/after of a reworded one", () => {
    const html = render(proposal())
    expect(html.indexOf("Teams")).toBeLessThan(html.indexOf("Commands"))
    expect(html.indexOf("Commands")).toBeLessThan(html.indexOf("Departments"))
    expect(html).toContain('guide-chip guide-chip--new">New<')
    expect(html).toContain('guide-chip guide-chip--removed">Removed<')
    expect(html).toContain('guide-chip guide-chip--reworded">Reworded<')
    expect(html).toContain("<b>Marketing</b>")
    expect(html).toContain("<b>/pricing-strategy</b>")
    expect(html).toContain("<s>Contracts and compliance.</s>")
    expect(html).toContain("Contracts, compliance and vendor reviews.")
  })

  it("draws a meter segment only for a kind that has changes, sized by its count", () => {
    const html = render(proposal())
    expect(html).toContain('class="guide-meter-new" style="flex:2"')
    expect(html).toContain('class="guide-meter-reworded" style="flex:1"')
    const onlyNew = render(proposal({ ...BASE, commands: [], departments: [] }, { ...BASE, commands: [], departments: [], teams: [...BASE.teams, { id: "m", label: "M", summary: "x", commands: [] }] }))
    expect(onlyNew).toContain("guide-meter-new")
    expect(onlyNew).not.toContain("guide-meter-removed")
  })

  it("keeps the real diff behind a collapsed 'Show technical details' and says everything else is untouched", () => {
    const html = render(proposal())
    expect(html).toContain("<details")
    expect(html).not.toContain("<details open")
    expect(html).toContain("Show technical details")
    expect(html).toContain("Everything else in AGENTS.md stays exactly as you wrote it.")
  })

  it("explains the technical-details disclosure in a tooltip", () => {
    expect(render(proposal())).toMatch(/<summary [^>]*title="Shows the exact lines that would change in the guide\."[^>]*>Show technical details<\/summary>/)
  })

  it("offers 'Update the guide' and 'Not now' with tooltips, never 'Ask for changes', and notes the commit", () => {
    const html = render(proposal())
    expect(html).toContain(">Update the guide<")
    expect(html).toContain(">Not now<")
    expect(html).toContain('title="Writes these changes into AGENTS.md')
    expect(html).toContain('title="Keeps the guide as it is.')
    expect(html).not.toContain("Ask for changes")
    expect(html).toContain("Saved as its own commit in this company's history, so it can be undone.")
  })

  it("says 'and N more' when a group was cut at the limit", () => {
    const p = proposal()
    p.groups[0].more = 5
    expect(render(p)).toContain("and 5 more")
  })

  it("shows the wording item without a before/after", () => {
    const old = parseBlock(renderGuide(BASE).block)
    if (old.kind !== "ok") throw new Error("expected a block")
    const p = buildProposal(old.body.replace("Read the company's", "Read my"), renderGuide(BASE), "b".repeat(64))
    const html = render(p)
    expect(html).toContain("Guide wording")
    expect(html).toContain("<b>The guide's standard wording was updated</b>")
    expect(html).toContain("1 change since your AIs last read it: 1 reworded")
  })
})
