import { describe, it, expect, vi } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
globalThis.React = React

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/jobs/actions", () => ({}))

import { JobsBoard } from "./jobs-board"
import type { SpendingView } from "@/lib/jobs/cost-words"

const base: SpendingView = { monthUsd: 0, unknownRuns: 0, jobs: [], limit: { ok: true, usd: null }, reached: false }
const html = (s: Partial<SpendingView>) =>
  renderToStaticMarkup(React.createElement(JobsBoard, { companyId: "acme", view: { ok: false, reason: "x" }, spending: { ...base, ...s }, now: 0 }))
    .replace(/&#x27;/g, "'")
const text = (h: string) => h.replace(/<[^>]+>/g, "")

describe("the spending section (v251 round 2)", () => {
  it("puts the limit-reached line right under the headline, in a medium weight, with Run still offered", () => {
    const h = html({ monthUsd: 6, limit: { ok: true, usd: 5 }, reached: true })
    const headline = h.indexOf("so far this month")
    const reached = h.indexOf("Limit reached.")
    expect(reached).toBeGreaterThan(headline)
    expect(h.slice(headline, reached)).not.toContain("Estimated")
    expect(h).toContain("You can still press Run yourself.")
    expect(h).toMatch(/<p class="font-medium[^"]*">Limit reached\./)
  })

  it("explains the soft limit only when one is set, and offers one short line otherwise", () => {
    expect(html({ limit: { ok: true, usd: 5 } })).toContain("This limit can be passed")
    const none = html({})
    expect(none).not.toContain("This limit can be passed")
    expect(none).toContain("Set a limit to stop scheduled runs")
  })

  it("offers Remove limit when the limit file is bad, and never pre-fills the amount", () => {
    const bad = html({ limit: { ok: false, reason: "bad value." } })
    expect(bad).toContain(">Remove limit<")
    expect(bad).toContain('placeholder="e.g. 25"')
    expect(html({})).not.toContain(">Remove limit<")
  })

  it("gives the limit field the buttons' focus ring", () => {
    expect(html({})).toMatch(/id="jobs-monthly-limit"[^>]*focus-visible:ring-\[3px\]/)
  })

  it("never reads as $0.00 when nothing was seen", () => {
    const h = text(html({ unknownRuns: 1, jobs: [{ job: "acme:retro", label: "Retrospective", monthUsd: 0, lastCostUsd: null, lastAt: "", runs: 1, knownRuns: 0 }] }))
    expect(h).toContain("No cost Alacrán could see yet this month.")
    expect(h).toContain("cost not known this month")
    expect(h).not.toContain("$0.00")
  })
})
