import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
globalThis.React = React

import { VerifyProposalCard, summariseVerify } from "./verify-proposal-card"
import { runCompanyVerify } from "@/lib/run-verify"
import type { VerifyResult } from "@/lib/run-verify-impl"

vi.mock("@/lib/run-verify", () => ({ runCompanyVerify: vi.fn() }))

type ReactWithInternals = typeof React & {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H?: Record<string, unknown> }
}

/** What each state setter was called with, in order. Slot 0 is the phase, slot 1 the result. */
let phaseCalls: unknown[] = []
let resultCalls: unknown[] = []
/** A starting value per slot, to render the card as if it were already in a state. */
let initial: Record<number, unknown> = {}

/** Find the first element of a given tag in a rendered tree (the test harness renders the component as a plain function). */
function findTag(node: unknown, tag: string): { props: { onClick?: () => void } } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findTag(child, tag)
      if (hit) return hit
    }
    return null
  }
  if (!node || typeof node !== "object") return null
  const el = node as { type?: unknown; props?: { children?: unknown } }
  if (el.type === tag) return el as { props: { onClick?: () => void } }
  return findTag(el.props?.children, tag)
}

const proposal = { companyId: "acme", commandId: "verify", actionType: "verify" as const, label: "Check Acme", fields: {} }
const failing: VerifyResult = {
  ran: true,
  passed: false,
  message: "Some checks failed",
  rows: [{ category: "secrets", id: "gitignore", status: "FAIL", message: "bad" }],
}

describe("VerifyProposalCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    phaseCalls = []
    resultCalls = []
    initial = {}
    let hooks = 0
    const reactAny = React as ReactWithInternals
    if (reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE) {
      reactAny.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H = {
        useState: (fallback: unknown) => {
          const slot = hooks++ % 2
          return [slot in initial ? initial[slot] : fallback, (value: unknown) => (slot === 0 ? phaseCalls : resultCalls).push(value)]
        },
      }
    }
  })

  it("offers the checks as a button and says nothing is changed", () => {
    const str = JSON.stringify(VerifyProposalCard({ proposal }))
    expect(str).toContain("Run the checks")
    expect(str).toContain("Nothing is changed")
  })

  it("runs the checks for that company only when the button is pressed", async () => {
    vi.mocked(runCompanyVerify).mockResolvedValue(failing)
    const el = VerifyProposalCard({ proposal })
    expect(runCompanyVerify).not.toHaveBeenCalled()
    findTag(el, "button")!.props.onClick!()
    await new Promise((r) => setTimeout(r, 0))
    expect(runCompanyVerify).toHaveBeenCalledTimes(1)
    expect(runCompanyVerify).toHaveBeenCalledWith("acme")
    expect(phaseCalls).toEqual(["running", "done"])
    expect(resultCalls).toEqual([null, failing])
  })

  it("says it could not run the checks, and goes back to idle, when the run throws", async () => {
    vi.mocked(runCompanyVerify).mockRejectedValue(new Error("boom"))
    findTag(VerifyProposalCard({ proposal }), "button")!.props.onClick!()
    await new Promise((r) => setTimeout(r, 0))
    expect(phaseCalls).toEqual(["running", "idle"])
    expect(resultCalls).toEqual([null, expect.objectContaining({ ran: false, message: "Couldn't run the checks. Try again." })])
  })

  it("clears the previous result the moment a re-run starts", async () => {
    let finish!: (r: VerifyResult) => void
    vi.mocked(runCompanyVerify).mockReturnValue(new Promise<VerifyResult>((resolve) => (finish = resolve)))
    initial = { 0: "done", 1: failing }
    const el = VerifyProposalCard({ proposal })
    expect(JSON.stringify(el)).toContain("Run again")
    findTag(el, "button")!.props.onClick!()
    // Synchronously after the press, while the run is still in flight: stale rows are already gone.
    expect(resultCalls).toEqual([null])
    expect(phaseCalls).toEqual(["running"])
    finish({ ran: true, passed: true, message: "All checks passed", rows: [] })
    await new Promise((r) => setTimeout(r, 0))
    expect(phaseCalls).toEqual(["running", "done"])
  })

  it("shows no button while running, and no stale rows", () => {
    initial = { 0: "running", 1: null }
    const str = JSON.stringify(VerifyProposalCard({ proposal }))
    expect(str).toContain("Running the checks")
    expect(str).not.toContain("Some checks failed")
    expect(str).not.toContain('"type":"button"')
  })
})

describe("summariseVerify", () => {
  it("shows the no-script message verbatim when nothing ran", () => {
    const message = "This company has no scripts/verify.py, so there are no checks to run."
    expect(summariseVerify({ ran: false, passed: false, rows: [], message })).toEqual([message])
  })

  it("shows a failing run as a result: the headline, then one line per check", () => {
    expect(
      summariseVerify({
        ...failing,
        rows: [
          { category: "secrets", id: "gitignore", status: "FAIL", message: "bad" },
          { category: "docs", id: "readme", status: "PASS", message: "fine" },
        ],
      })
    ).toEqual(["Some checks failed", "FAIL — bad", "PASS — fine"])
  })

  it("shows a clean run with its checks", () => {
    expect(
      summariseVerify({ ran: true, passed: true, message: "All checks passed", rows: [{ category: "docs", id: "readme", status: "INFO", message: "ok" }] })
    ).toEqual(["All checks passed", "INFO — ok"])
  })
})
